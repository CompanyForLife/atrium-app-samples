# Atrium hello-node

Minimal Atrium web app using Node.js stdlib (`node:http`, `node:crypto`).

Default port: **5100** (`PORT` env override).

## Run

```bash
npm start
```

Your process reads `ATRIUM_SETUP_SECRET` to verify the first `lifecycle.setup` call. That is your app's own setup secret: COHO mints it when you register the app and shows it once in the create response (regenerate it from My apps if lost). On Atrium Hosting, COHO injects the env var for you; when self-hosting, set it yourself before connecting. Set `ATRIUM_DATA_DIR` to persist connection secrets and config across restarts. Set `ATRIUM_FRAME_ANCESTORS` to the COHO origin allowed to embed `/ui`, and set `ATRIUM_PARENT_ORIGIN` to that exact origin for the close message (for example `http://localhost:4200` in local development).

## Endpoints

Same runtime contract as the other hello samples:

- `/health`
- signed `/webhooks/atrium/*`
- signed native config at `/config/schema` and `/config`
- signed iframe quick view at `/ui`
- external app-owned page at `/configure`

COHO opens `/ui` and `/configure` with a short-lived signed launch URL that includes `connectionReference`, `atriumUsageToken` (person + organisation + connection JWT), and `atriumSignature`. Prefer `Authorization: Bearer <atriumUsageToken>` for interactive Public API calls from the quick view; keep the connection `apiKey` from `lifecycle.setup` for background/webhooks. See [developer spec §6 / §8](../../docs/atrium-app-developer-spec.md).

For local Store registration, use [`manifest.example.json`](./manifest.example.json).

Signature verification is pinned to the published test vectors in the [app developer spec](../../docs/atrium-app-developer-spec.md#311-signature-test-vectors).

## Design

`design/` holds the COHO design guide for Atrium apps (`design.md`), the log of gaps builders have hit and what was done about each (`design-gaps.md`), COHO's stylesheet (`coho.css`), a prebuilt icon sprite (`icons.svg`) and the checker (`check.cjs`). `/ui` and `/configure` are built from it: `src/ui.html` and `src/configure.html` link `/design/coho.css` and use only the parts the guide documents. Read [`AGENTS.md`](./AGENTS.md) before changing any UI, and run `npm run check:design` before finishing. The folder is generated from `docs/design/atrium` in HouseShare; do not edit it here.

## Tests

```bash
npm test
```
