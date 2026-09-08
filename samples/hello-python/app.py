#!/usr/bin/env python3
"""Minimal Atrium self-host app (stdlib only)."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

ATRIUM_SIGNATURE_HEADER = "x-atrium-signature"
DEFAULT_TOLERANCE_SECONDS = 300
MAX_FUTURE_SKEW_SECONDS = 30
PORT = int(os.environ.get("PORT", "5101"))
SETUP_BOOTSTRAP_SECRET = os.environ.get("ATRIUM_SETUP_SECRET")
if not SETUP_BOOTSTRAP_SECRET:
    raise RuntimeError("ATRIUM_SETUP_SECRET is required")

secrets: dict[str, str] = {}
configs: dict[str, dict[str, Any]] = {}

CONFIG_SCHEMA = {
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


def send_json(handler: BaseHTTPRequestHandler, status: int, body: dict[str, Any]) -> None:
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


class AtriumHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        print(f"[hello-python] {self.address_string()} - {format % args}")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/health":
            send_json(
                self,
                200,
                {"ok": True, "message": f"hello-python; connections={len(secrets)}"},
            )
            return

        if path == "/config/schema":
            self._handle_signed_config(parsed, lambda _ref: CONFIG_SCHEMA)
            return

        if path == "/config":
            self._handle_signed_config(parsed, lambda ref: configs.get(ref, {}))
            return

        send_json(self, 404, {"ok": False, "message": "Not found"})

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/config":
            def save_config(ref: str, raw_body: str) -> dict[str, Any]:
                try:
                    config = json.loads(raw_body) if raw_body else {}
                except json.JSONDecodeError as exc:
                    raise ValueError("Invalid JSON") from exc
                configs[ref] = config
                print(f"[hello-python] config saved {ref}")
                return config

            self._handle_signed_config(parsed, save_config, allow_body=True)
            return

        send_json(self, 404, {"ok": False, "message": "Not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        raw_body = self._read_body()

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

    def _read_body(self) -> str:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return ""
        return self.rfile.read(length).decode("utf-8")

    def _parse_envelope(self, raw_body: str) -> dict[str, Any] | None:
        try:
            return json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
            send_json(self, 400, {"ok": False, "message": "Invalid JSON"})
            return None

    def _handle_setup(self, raw_body: str) -> None:
        envelope = self._parse_envelope(raw_body)
        if envelope is None:
            return

        setup_secret = (envelope.get("data") or {}).get("signingSecret")
        if not setup_secret:
            send_json(self, 401, {"ok": False, "message": "Missing signing secret in setup"})
            return

        header = self.headers.get(ATRIUM_SIGNATURE_HEADER)
        parsed = urlparse(self.path)
        if not verify_atrium_signature(
            raw_body,
            header,
            SETUP_BOOTSTRAP_SECRET,
            self.command,
            path_and_query_for_signature(parsed),
            str(envelope.get("connectionReference") or ""),
        ):
            send_json(self, 401, {"ok": False, "message": "Invalid signature"})
            return

        connection_reference = envelope.get("connectionReference")
        if not connection_reference:
            send_json(self, 400, {"ok": False, "message": "Missing connectionReference"})
            return

        print(
            "[hello-python] setup",
            {
                "connectionReference": connection_reference,
                "organisationReference": envelope.get("organisationReference"),
            },
        )
        secrets[connection_reference] = setup_secret
        configs[connection_reference] = {"greeting": "Hello from Atrium"}
        send_json(self, 200, {"ok": True})

    def _handle_signed_webhook(
        self,
        raw_body: str,
        label: str,
        handler: Any,
    ) -> None:
        envelope = self._parse_envelope(raw_body)
        if envelope is None:
            return

        connection_reference = envelope.get("connectionReference")
        secret = secrets.get(connection_reference or "")
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
        handler: Any,
        allow_body: bool = False,
    ) -> None:
        params = parse_qs(parsed.query)
        connection_reference = (params.get("connectionReference") or [None])[0]
        if not connection_reference:
            send_json(self, 400, {"ok": False, "message": "connectionReference query required"})
            return

        raw_body = self._read_body() if allow_body else ""
        secret = secrets.get(connection_reference)
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
            if allow_body:
                result = handler(connection_reference, raw_body)
            else:
                result = handler(connection_reference)
            send_json(self, 200, result)
        except ValueError as exc:
            send_json(self, 400, {"ok": False, "message": str(exc) or "Bad request"})
        except Exception as exc:  # noqa: BLE001
            print("[hello-python] config error", exc)
            send_json(self, 500, {"ok": False, "message": str(exc) or "Config handler failed"})

    @staticmethod
    def _on_disconnect(envelope: dict[str, Any]) -> None:
        ref = envelope.get("connectionReference")
        print(f"[hello-python] disconnect {ref}")
        secrets.pop(ref, None)
        configs.pop(ref, None)

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
    server = ThreadingHTTPServer(("0.0.0.0", PORT), AtriumHandler)
    print(f"[hello-python] listening on http://0.0.0.0:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
