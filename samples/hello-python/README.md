# Atrium hello-python

Minimal self-host Atrium app using only the Python stdlib (`http.server`, `hmac`, `hashlib`). In-memory secrets and config.

Default port: **5101** (`PORT` env override).

## Run

```bash
python3 app.py
```

No pip install required.

## Endpoints

Same contract as the other hello samples: `/health`, signed `/webhooks/atrium/*`, and optional `/config` routes.

Signature verification is pinned to the published test vectors in the [app developer spec](../../docs/atrium-app-developer-spec.md#311-signature-test-vectors).
