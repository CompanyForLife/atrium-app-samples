#!/usr/bin/env python3
"""Minimal Atrium self-host app (stdlib only)."""

from __future__ import annotations

import hashlib
import hmac
import html
import json
import os
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

ATRIUM_SIGNATURE_HEADER = "x-atrium-signature"
DEFAULT_TOLERANCE_SECONDS = 300
MAX_FUTURE_SKEW_SECONDS = 30
MAX_BODY_BYTES = 1024 * 1024
QUICK_VIEW_PATH = "/ui"
EXTERNAL_CONFIG_PATH = "/configure"
CONVERSATIONS_PROBE_PATH = "/v1.1/public/conversations?count=1"
SETTLEMENTS_PROBE_PATH = "/v1.1/public/finance/settlements?page=1&pageSize=1"
PROBE_TIMEOUT_SECONDS = 15

CONFIG_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "title": "Hello Atrium settings",
    "additionalProperties": False,
    "properties": {
        "greeting": {
            "type": "string",
            "title": "Greeting",
            "description": "Shown at the top of the app quick view.",
            "default": "Hello from Atrium",
            "minLength": 1,
            "maxLength": 120,
        },
    },
    "required": ["greeting"],
}


@dataclass
class ConnectionState:
    signing_secret: str
    api_key: str = ""
    api_base_url: str = ""


@dataclass
class ProbeResult:
    capability: str
    path: str
    status: int = 0
    ok: bool = False
    error: str = ""


connections: dict[str, ConnectionState] = {}
configs: dict[str, dict[str, Any]] = {}
state_lock = threading.Lock()
state_file: str | None = None
setup_bootstrap_secret: str = ""


def path_and_query_for_signature(parsed: Any) -> str:
    pairs = [
        part
        for part in (parsed.query.split("&") if parsed.query else [])
        if part and not part.lower().startswith("atriumsignature")
    ]
    return parsed.path + (f"?{'&'.join(pairs)}" if pairs else "")


def verify_atrium_signature(
    raw_body: str,
    signature_header: str | None,
    signing_secret: str,
    method: str,
    path_and_query: str,
    connection_reference: str,
    now: float | None = None,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
) -> bool:
    if not signature_header or not signing_secret or not method or not path_and_query or not connection_reference:
        return False

    timestamp: int | None = None
    v1: str | None = None
    for part in signature_header.split(","):
        trimmed = part.strip()
        if "=" not in trimmed:
            continue
        key, value = trimmed.split("=", 1)
        if key == "t":
            try:
                timestamp = int(value)
            except ValueError:
                return False
        elif key == "v1":
            v1 = value.strip().lower()

    if timestamp is None or not v1:
        return False

    now_ts = now if now is not None else time.time()
    if timestamp > now_ts + MAX_FUTURE_SKEW_SECONDS:
        return False
    if now_ts - timestamp > tolerance_seconds:
        return False

    signed_payload = (
        f"{timestamp}.{method.strip().upper()}.{path_and_query}.{connection_reference}.{raw_body}"
    )
    expected = hmac.new(
        signing_secret.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest().lower()
    return hmac.compare_digest(expected, v1)


def load_connection(connection_reference: str) -> ConnectionState | None:
    state = connections.get(connection_reference)
    if state is None or not state.signing_secret:
        return None
    return state


def load_secret(connection_reference: str) -> str | None:
    state = load_connection(connection_reference)
    return state.signing_secret if state else None


def load_state() -> None:
    if not state_file:
        return
    try:
        with open(state_file, "r", encoding="utf-8") as handle:
            raw = handle.read()
    except FileNotFoundError:
        return

    state = json.loads(raw) if raw else {}
    for reference, connection in (state.get("connections") or {}).items():
        if not isinstance(connection, dict):
            continue
        signing_secret = connection.get("signingSecret") or ""
        if not signing_secret:
            continue
        connections[reference] = ConnectionState(
            signing_secret=signing_secret,
            api_key=connection.get("apiKey") or "",
            api_base_url=(connection.get("apiBaseUrl") or "").strip().rstrip("/"),
        )

    # Legacy state files only stored signing secrets.
    for reference, secret in (state.get("secrets") or {}).items():
        if not secret or reference in connections:
            continue
        connections[reference] = ConnectionState(signing_secret=secret)

    for reference, config in (state.get("configs") or {}).items():
        if isinstance(config, dict):
            configs[reference] = config


def persist_state() -> None:
    if not state_file:
        return
    with state_lock:
        _persist_state_locked()


def _persist_state_locked() -> None:
    if not state_file:
        return

    payload = {
        "connections": {
            reference: {
                "signingSecret": state.signing_secret,
                **({"apiKey": state.api_key} if state.api_key else {}),
                **({"apiBaseUrl": state.api_base_url} if state.api_base_url else {}),
            }
            for reference, state in connections.items()
            if state.signing_secret
        },
        "configs": dict(configs),
    }
    data = json.dumps(payload).encode("utf-8")
    temp_file = state_file + ".tmp"
    fd = os.open(temp_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.chmod(temp_file, 0o600)
        os.replace(temp_file, state_file)
        os.chmod(state_file, 0o600)
    except Exception:
        try:
            os.unlink(temp_file)
        except OSError:
            pass
        raise


def store_connection_state(connection_reference: str, state: ConnectionState) -> None:
    with state_lock:
        connections[connection_reference] = state
        configs[connection_reference] = {"greeting": "Hello from Atrium"}
        _persist_state_locked()


def delete_connection_state(connection_reference: str) -> None:
    with state_lock:
        connections.pop(connection_reference, None)
        configs.pop(connection_reference, None)
        _persist_state_locked()


def store_config_state(connection_reference: str, config: dict[str, Any]) -> None:
    with state_lock:
        configs[connection_reference] = config
        _persist_state_locked()


def sanitize_frame_ancestors(value: str | None) -> str:
    trimmed = (value or "").strip()
    if not trimmed:
        return "'none'"
    allowed = set(" *.://-_")
    for character in trimmed:
        if character.isalnum() or character in allowed:
            continue
        return "'none'"
    return trimmed


def parent_origin() -> str:
    raw = os.environ.get("ATRIUM_PARENT_ORIGIN") or "http://localhost:4200"
    parsed = urlparse(raw)
    if (
        not parsed.scheme
        or not parsed.netloc
        or parsed.path != ""
        or parsed.scheme not in ("http", "https")
    ):
        return "http://localhost:4200"
    return f"{parsed.scheme}://{parsed.netloc}"


def probe_public_api(api_base_url: str, api_key: str, capability: str, path: str) -> ProbeResult:
    result = ProbeResult(capability=capability, path=path)
    request = Request(
        api_base_url + path,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=PROBE_TIMEOUT_SECONDS) as response:
            response.read(64 * 1024)
            result.status = getattr(response, "status", 200)
            result.ok = 200 <= result.status < 300
    except HTTPError as exc:
        result.status = exc.code
        result.ok = False
        try:
            exc.read(64 * 1024)
        except Exception:  # noqa: BLE001
            pass
    except URLError:
        result.error = "request failed"
    except Exception:  # noqa: BLE001
        result.error = "request failed"
    return result


def run_public_api_probes(connection_reference: str) -> list[ProbeResult]:
    state = load_connection(connection_reference)
    if state is None:
        return [
            ProbeResult(capability="conversations", path=CONVERSATIONS_PROBE_PATH, error="unknown connection"),
            ProbeResult(capability="settlements", path=SETTLEMENTS_PROBE_PATH, error="unknown connection"),
        ]
    if not state.api_base_url or not state.api_key:
        return [
            ProbeResult(capability="conversations", path=CONVERSATIONS_PROBE_PATH, error="api credentials missing"),
            ProbeResult(capability="settlements", path=SETTLEMENTS_PROBE_PATH, error="api credentials missing"),
        ]
    return [
        probe_public_api(state.api_base_url, state.api_key, "conversations", CONVERSATIONS_PROBE_PATH),
        probe_public_api(state.api_base_url, state.api_key, "settlements", SETTLEMENTS_PROBE_PATH),
    ]


def quick_view_html(greeting: str, allowed_parent_origin: str, probes: list[ProbeResult]) -> str:
    parent_origin_json = json.dumps(allowed_parent_origin)
    probe_rows: list[str] = []
    for probe in probes:
        status_label = str(probe.status) if probe.status > 0 else "n/a"
        detail = probe.error if probe.error else status_label
        outcome = "ok" if probe.ok else "fail"
        probe_rows.append(
            "<li><strong>"
            + html.escape(probe.capability)
            + "</strong> <code>"
            + html.escape(probe.path)
            + '</code> — <span class="probe-'
            + outcome
            + '">'
            + html.escape(detail)
            + "</span></li>"
        )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hello from Python</title>
  <style>
    body {{ background: #eef8f1; color: #17351f; font-family: system-ui, sans-serif; margin: 0; padding: 2rem; }}
    main {{ margin: auto; max-width: 42rem; }}
    .language {{ color: #087e8b; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }}
    button {{ background: #17351f; border: 0; border-radius: .35rem; color: white; cursor: pointer; padding: .7rem 1rem; }}
    .probes {{ background: #fff; border: 1px solid #c5dfcc; border-radius: .5rem; margin: 1.5rem 0; padding: 1rem 1.25rem; }}
    .probes ul {{ margin: .5rem 0 0; padding-left: 1.2rem; }}
    .probes li {{ margin: .4rem 0; }}
    code {{ font-size: .85em; }}
    .probe-ok {{ color: #087e8b; font-weight: 600; }}
    .probe-fail {{ color: #9b2226; font-weight: 600; }}
  </style>
</head>
<body>
  <main>
    <p class="language">Python sample app</p>
    <h1>{html.escape(greeting)}</h1>
    <p>This iframe is rendered by the hosted Python process, not by COHO or Node.</p>
    <section class="probes">
      <h2>Public API capability probes</h2>
      <p>Harmless GETs used to demonstrate capability approval. Granted scopes should return 2xx; newly requested scopes return 403 until approved.</p>
      <ul>{"".join(probe_rows)}</ul>
    </section>
    <button type="button" id="close">Close quick view</button>
  </main>
  <script>
    document.getElementById('close').addEventListener('click', function () {{
      parent.postMessage({{ type: 'atrium.quickView.close' }}, {parent_origin_json});
    }});
  </script>
</body>
</html>"""


def external_config_html() -> str:
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hello Python configuration</title>
  <style>
    body { background: #0d1b2a; color: #e0fbfc; font-family: system-ui, sans-serif; margin: 0; padding: 2rem; }
    main { margin: auto; max-width: 42rem; }
    code { color: #98c1d9; }
  </style>
</head>
<body>
  <main>
    <h1>Hello Python configuration</h1>
    <p>This is the app-owned external configuration surface opened in a new tab.</p>
    <p>The sample keeps organisation settings in COHO's native JSON Schema form. A production app could authenticate its own users here and offer richer settings.</p>
    <p>Runtime: <code>Python http.server</code>.</p>
  </main>
</body>
</html>"""


def send_json(handler: BaseHTTPRequestHandler, status: int, body: Any) -> None:
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


def send_html(handler: BaseHTTPRequestHandler, body: str, extra_headers: dict[str, str] | None = None) -> None:
    payload = body.encode("utf-8")
    handler.send_response(200)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("Content-Length", str(len(payload)))
    if extra_headers:
        for key, value in extra_headers.items():
            handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(payload)


class AtriumHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        print(f"[hello-python] {self.address_string()} - {format % args}")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            send_json(
                self,
                200,
                {"ok": True, "message": f"hello-python; connections={len(connections)}"},
            )
            return

        if path == "/config/schema":
            self._handle_signed_config(parsed, lambda _ref, _body: CONFIG_SCHEMA)
            return

        if path == "/config":
            self._handle_signed_config(parsed, lambda ref, _body: configs.get(ref, {}))
            return

        if path == QUICK_VIEW_PATH:
            self._handle_quick_view(parsed)
            return

        if path == EXTERNAL_CONFIG_PATH:
            self._handle_external_config(parsed)
            return

        send_json(self, 404, {"ok": False, "message": "Not found"})

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/config":
            def save_config(ref: str, raw_body: str) -> dict[str, Any]:
                try:
                    config = json.loads(raw_body) if raw_body else {}
                except json.JSONDecodeError as exc:
                    raise ValueError("Invalid JSON") from exc
                if not isinstance(config, dict):
                    raise ValueError("Invalid JSON")
                store_config_state(ref, config)
                print(f"[hello-python] config saved {ref}")
                return config

            self._handle_signed_config(parsed, save_config, allow_body=True)
            return

        send_json(self, 404, {"ok": False, "message": "Not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        raw_body = self._read_body()
        if raw_body is None:
            return

        if path == "/webhooks/atrium/setup":
            self._handle_setup(raw_body)
            return

        if path == "/webhooks/atrium/disconnect":
            self._handle_signed_webhook(raw_body, "disconnect", self._on_disconnect)
            return

        if path == "/webhooks/atrium/triggers/event":
            self._handle_signed_webhook(raw_body, "event", self._on_event)
            return

        if path == "/webhooks/atrium/triggers/schedule":
            self._handle_signed_webhook(raw_body, "schedule", self._on_schedule)
            return

        send_json(self, 404, {"ok": False, "message": "Not found"})

    def _read_body(self) -> str | None:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return ""
        if length > MAX_BODY_BYTES:
            send_json(self, 400, {"ok": False, "message": "Invalid body"})
            return None
        return self.rfile.read(length).decode("utf-8")

    def _parse_envelope(self, raw_body: str) -> dict[str, Any] | None:
        try:
            return json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
            send_json(self, 400, {"ok": False, "message": "Invalid JSON"})
            return None

    def _verify_browser_launch(self, parsed: Any) -> str | None:
        params = parse_qs(parsed.query)
        connection_reference = (params.get("connectionReference") or [None])[0] or ""
        secret = load_secret(connection_reference)
        signature = (params.get("atriumSignature") or [None])[0]
        if not secret or not verify_atrium_signature(
            "",
            signature,
            secret,
            self.command,
            path_and_query_for_signature(parsed),
            connection_reference,
        ):
            send_json(self, 401, {"ok": False, "message": "Invalid signature"})
            return None
        return connection_reference

    def _handle_quick_view(self, parsed: Any) -> None:
        connection_reference = self._verify_browser_launch(parsed)
        if connection_reference is None:
            return

        greeting = "Hello from Atrium"
        config = configs.get(connection_reference) or {}
        configured = config.get("greeting")
        if isinstance(configured, str) and configured:
            greeting = configured

        probes = run_public_api_probes(connection_reference)
        frame_ancestors = sanitize_frame_ancestors(os.environ.get("ATRIUM_FRAME_ANCESTORS"))
        body = quick_view_html(greeting, parent_origin(), probes)
        send_html(
            self,
            body,
            extra_headers={"Content-Security-Policy": f"frame-ancestors {frame_ancestors}"},
        )

    def _handle_external_config(self, parsed: Any) -> None:
        if self._verify_browser_launch(parsed) is None:
            return
        send_html(self, external_config_html())

    def _handle_setup(self, raw_body: str) -> None:
        envelope = self._parse_envelope(raw_body)
        if envelope is None:
            return

        data = envelope.get("data") or {}
        if not isinstance(data, dict):
            data = {}
        setup_secret = data.get("signingSecret")
        if not setup_secret:
            send_json(self, 401, {"ok": False, "message": "Missing signing secret in setup"})
            return

        connection_reference = envelope.get("connectionReference")
        if not connection_reference:
            send_json(self, 400, {"ok": False, "message": "Missing connectionReference"})
            return

        header = self.headers.get(ATRIUM_SIGNATURE_HEADER)
        parsed = urlparse(self.path)
        if not verify_atrium_signature(
            raw_body,
            header,
            setup_bootstrap_secret,
            self.command,
            path_and_query_for_signature(parsed),
            str(connection_reference),
        ):
            send_json(self, 401, {"ok": False, "message": "Invalid signature"})
            return

        api_key = data.get("apiKey") or ""
        api_base_url = str(data.get("apiBaseUrl") or "").strip().rstrip("/")

        print(
            f"[hello-python] setup connectionReference={connection_reference} "
            f"organisationReference={envelope.get('organisationReference')} apiBaseUrl={api_base_url}"
        )
        try:
            store_connection_state(
                str(connection_reference),
                ConnectionState(
                    signing_secret=str(setup_secret),
                    api_key=str(api_key),
                    api_base_url=api_base_url,
                ),
            )
        except OSError as exc:
            print("[hello-python] setup persist error", exc)
            send_json(self, 500, {"ok": False, "message": "Could not persist setup"})
            return
        send_json(self, 200, {"ok": True})

    def _handle_signed_webhook(
        self,
        raw_body: str,
        label: str,
        handler: Callable[[dict[str, Any]], None],
    ) -> None:
        envelope = self._parse_envelope(raw_body)
        if envelope is None:
            return

        connection_reference = envelope.get("connectionReference")
        secret = load_secret(str(connection_reference or ""))
        if not secret:
            send_json(self, 401, {"ok": False, "message": "Unknown connection"})
            return

        header = self.headers.get(ATRIUM_SIGNATURE_HEADER)
        parsed = urlparse(self.path)
        if not verify_atrium_signature(
            raw_body,
            header,
            secret,
            self.command,
            path_and_query_for_signature(parsed),
            str(connection_reference),
        ):
            send_json(self, 401, {"ok": False, "message": "Invalid signature"})
            return

        try:
            handler(envelope)
            send_json(self, 200, {"ok": True})
        except Exception as exc:  # noqa: BLE001
            print(f"[hello-python] {label} error", exc)
            send_json(self, 500, {"ok": False, "message": str(exc) or "Handler failed"})

    def _handle_signed_config(
        self,
        parsed: Any,
        handler: Callable[[str, str], Any],
        allow_body: bool = False,
    ) -> None:
        params = parse_qs(parsed.query)
        connection_reference = (params.get("connectionReference") or [None])[0]
        if not connection_reference:
            send_json(self, 400, {"ok": False, "message": "connectionReference query required"})
            return

        raw_body = ""
        if allow_body:
            body = self._read_body()
            if body is None:
                return
            raw_body = body

        secret = load_secret(connection_reference)
        if not secret:
            send_json(self, 401, {"ok": False, "message": "Unknown connection"})
            return

        header = self.headers.get(ATRIUM_SIGNATURE_HEADER)
        if not verify_atrium_signature(
            raw_body,
            header,
            secret,
            self.command,
            path_and_query_for_signature(parsed),
            connection_reference,
        ):
            send_json(self, 401, {"ok": False, "message": "Invalid signature"})
            return

        try:
            result = handler(connection_reference, raw_body)
            send_json(self, 200, result)
        except ValueError as exc:
            send_json(self, 400, {"ok": False, "message": str(exc) or "Bad request"})
        except Exception as exc:  # noqa: BLE001
            print("[hello-python] config error", exc)
            send_json(self, 500, {"ok": False, "message": str(exc) or "Config handler failed"})

    @staticmethod
    def _on_disconnect(envelope: dict[str, Any]) -> None:
        ref = str(envelope.get("connectionReference") or "")
        print(f"[hello-python] disconnect {ref}")
        delete_connection_state(ref)

    @staticmethod
    def _on_event(envelope: dict[str, Any]) -> None:
        print(
            "[hello-python] event",
            envelope.get("type"),
            envelope.get("deliveryId"),
        )

    @staticmethod
    def _on_schedule(envelope: dict[str, Any]) -> None:
        print(
            "[hello-python] schedule",
            envelope.get("type"),
            envelope.get("deliveryId"),
        )


def main() -> None:
    global setup_bootstrap_secret, state_file

    setup_bootstrap_secret = os.environ.get("ATRIUM_SETUP_SECRET") or ""
    if not setup_bootstrap_secret:
        raise SystemExit("ATRIUM_SETUP_SECRET is required")

    data_dir = os.environ.get("ATRIUM_DATA_DIR")
    if data_dir:
        os.makedirs(data_dir, mode=0o750, exist_ok=True)
        state_file = os.path.join(data_dir, "hello-python-state.json")
        load_state()

    port = int(os.environ.get("PORT", "5101"))
    server = ThreadingHTTPServer(("0.0.0.0", port), AtriumHandler)
    print(f"[hello-python] listening on http://0.0.0.0:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
