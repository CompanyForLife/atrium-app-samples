# Atrium hello-python

Minimal Atrium web app using Python stdlib (`http.server`, `hmac`, `hashlib`, `urllib`).

Default port: **5101** (`PORT` env override).

## Run

```bash
python3 app.py
```

Your process reads `ATRIUM_SETUP_SECRET` to verify the first `lifecycle.setup` call. That is your app's own setup secret: COHO mints it when you register the app and shows it once in the create response (regenerate it from My apps if lost). On Atrium Hosting, COHO injects the env var for you; when self-hosting, set it yourself before connecting. Set `ATRIUM_DATA_DIR` to persist connection secrets and config across restarts (`hello-python-state.json`). Bake one-image COHO `frame-ancestors` wildcards by default (`*.coho.management` etc.). Optional `ATRIUM_FRAME_ANCESTORS` is unioned with that list. Set `ATRIUM_PARENT_ORIGIN` to the exact Store origin for close postMessage — deploy-inject per environment (for example `http://localhost:4200` locally, `https://applabs.coho.management` on Labs).

No pip install required.

## Endpoints

Same runtime contract as the other hello samples:

- `/health`
- signed `/webhooks/atrium/*`
- signed native config at `/config/schema` and `/config`
- signed iframe quick view at `/ui`
- external app-owned page at `/configure`

For local Store registration, use [`manifest.example.json`](./manifest.example.json).

Signature verification is pinned to the published test vectors in the [app developer spec](../../docs/atrium-app-developer-spec.md#311-signature-test-vectors).

## Tests

```bash
python3 -m unittest test_app.py -v
```
