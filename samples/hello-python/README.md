# Atrium hello-python

Minimal Atrium web app using Python stdlib (`http.server`, `hmac`, `hashlib`, `urllib`).

Default port: **5101** (`PORT` env override).

## Run

```bash
python3 app.py
```

Your process reads `ATRIUM_SETUP_SECRET` to verify the first `lifecycle.setup` call. That is your app's own setup secret: COHO mints it when you register the app and shows it once in the create response (regenerate it from My apps if lost). On Atrium Hosting, COHO injects the env var for you; when self-hosting, set it yourself before connecting. Set `ATRIUM_DATA_DIR` to persist connection secrets and config across restarts (`hello-python-state.json`). Set `ATRIUM_FRAME_ANCESTORS` and `ATRIUM_PARENT_ORIGIN` to the Store origin for the environment you embed from (same value for both). Playground and production values are in [developer spec §6](../../docs/atrium-app-developer-spec.md#self-host-store-origins); when unset, these kits default to `http://localhost:4200` for local `ng serve`.

No pip install required.

## Endpoints

Same runtime contract as the other hello samples:

- `/health`
- signed `/webhooks/atrium/*`
- signed native config at `/config/schema` and `/config`
- signed iframe quick view at `/ui` (launch URL includes `atriumUsageToken` — prefer that Bearer for interactive Public API calls; connection `apiKey` for background — [spec §6 / §8](../../docs/atrium-app-developer-spec.md))
- external app-owned page at `/configure`

For local Store registration, use [`manifest.example.json`](./manifest.example.json).

Signature verification is pinned to the published test vectors in the [app developer spec](../../docs/atrium-app-developer-spec.md#311-signature-test-vectors).

## Tests

```bash
python3 -m unittest test_app.py -v
```
