#!/usr/bin/env python3
"""Unit tests for hello-python (stdlib unittest only)."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import shutil
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer

import app as hello


def create_test_signature(secret: str, method: str, path_and_query: str, connection_reference: str) -> str:
    timestamp = int(time.time())
    payload = f"{timestamp}.{method}.{path_and_query}.{connection_reference}."
    digest = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


class HelloPythonTests(unittest.TestCase):
    def setUp(self) -> None:
        hello.connections.clear()
        hello.configs.clear()
        hello.state_file = None
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self._base_url = ""

    def tearDown(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)
        hello.connections.clear()
        hello.configs.clear()
        hello.state_file = None
        os.environ.pop("ATRIUM_FRAME_ANCESTORS", None)
        os.environ.pop("ATRIUM_PARENT_ORIGIN", None)

    def _start_server(self) -> None:
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), hello.AtriumHandler)
        port = self._server.server_address[1]
        self._base_url = f"http://127.0.0.1:{port}"
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def _get(self, path_and_query: str) -> tuple[int, dict[str, str], bytes]:
        assert self._base_url
        request = urllib.request.Request(self._base_url + path_and_query, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                headers = {key.lower(): value for key, value in response.headers.items()}
                return response.status, headers, response.read()
        except urllib.error.HTTPError as exc:
            headers = {key.lower(): value for key, value in exc.headers.items()}
            return exc.code, headers, exc.read()

    def test_quick_view_rejects_missing_signature(self) -> None:
        connection_reference = "11111111-1111-1111-1111-111111111111"
        hello.connections[connection_reference] = hello.ConnectionState(signing_secret="sample-secret")
        self._start_server()

        status, _headers, body = self._get(f"/ui?connectionReference={connection_reference}")
        self.assertEqual(status, 401)
        payload = json.loads(body.decode("utf-8"))
        self.assertFalse(payload.get("ok"))

    def test_quick_view_escapes_greeting(self) -> None:
        connection_reference = "11111111-1111-1111-1111-111111111111"
        secret = "sample-secret"
        hello.connections[connection_reference] = hello.ConnectionState(signing_secret=secret)
        hello.configs[connection_reference] = {"greeting": "<script>alert(1)</script>"}
        os.environ["ATRIUM_FRAME_ANCESTORS"] = "https://labs.coho.life"
        self._start_server()

        path_and_query = f"/ui?connectionReference={connection_reference}"
        signature = create_test_signature(secret, "GET", path_and_query, connection_reference)
        status, headers, body = self._get(
            path_and_query + "&atriumSignature=" + urllib.parse.quote(signature)
        )
        text = body.decode("utf-8")

        self.assertEqual(status, 200)
        self.assertEqual(headers.get("content-security-policy"), "frame-ancestors https://labs.coho.life")
        self.assertNotIn("<script>alert(1)</script>", text)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", text)
        self.assertIn("Python sample app", text)

    def test_external_config_requires_signed_launch(self) -> None:
        connection_reference = "33333333-3333-3333-3333-333333333333"
        secret = "external-secret"
        hello.connections[connection_reference] = hello.ConnectionState(signing_secret=secret)
        self._start_server()

        path_and_query = f"/configure?connectionReference={connection_reference}"
        signature = create_test_signature(secret, "GET", path_and_query, connection_reference)
        status, _headers, body = self._get(
            path_and_query + "&atriumSignature=" + urllib.parse.quote(signature)
        )
        text = body.decode("utf-8")

        self.assertEqual(status, 200)
        self.assertIn("external configuration surface", text)

    def test_persisted_state_survives_reload(self) -> None:
        temp_dir = self._temp_dir()
        hello.state_file = os.path.join(temp_dir, "hello-python-state.json")
        connection_reference = "22222222-2222-2222-2222-222222222222"
        hello.connections[connection_reference] = hello.ConnectionState(
            signing_secret="persisted-secret",
            api_key="api-key-guid",
            api_base_url="https://api.example.com",
        )
        hello.configs[connection_reference] = {"greeting": "Persistent hello"}

        hello.persist_state()

        hello.connections.clear()
        hello.configs.clear()
        hello.load_state()

        state = hello.load_connection(connection_reference)
        self.assertIsNotNone(state)
        assert state is not None
        self.assertEqual(state.signing_secret, "persisted-secret")
        self.assertEqual(state.api_key, "api-key-guid")
        self.assertEqual(state.api_base_url, "https://api.example.com")
        self.assertEqual(hello.configs[connection_reference]["greeting"], "Persistent hello")

        mode = os.stat(hello.state_file).st_mode & 0o777
        self.assertEqual(mode, 0o600)

        with open(hello.state_file, "r", encoding="utf-8") as handle:
            persisted = json.load(handle)
        self.assertNotIn("secrets", persisted)
        self.assertIn(connection_reference, persisted["connections"])

    def test_load_state_migrates_legacy_secrets(self) -> None:
        temp_dir = self._temp_dir()
        hello.state_file = os.path.join(temp_dir, "hello-python-state.json")
        with open(hello.state_file, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "secrets": {"legacy-ref": "legacy-secret"},
                    "configs": {},
                },
                handle,
            )

        hello.load_state()
        secret = hello.load_secret("legacy-ref")
        self.assertEqual(secret, "legacy-secret")

    def _temp_dir(self) -> str:
        path = tempfile.mkdtemp(prefix="hello-python-test-")
        self.addCleanup(lambda: shutil.rmtree(path, ignore_errors=True))
        return path


if __name__ == "__main__":
    unittest.main()
