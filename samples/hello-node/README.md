# Atrium hello-node

Minimal Atrium web app using Node.js stdlib (`node:http`, `node:crypto`).

Default port: **5100** (`PORT` env override).

## Run

```bash
npm start
```

Your process reads `ATRIUM_SETUP_SECRET` to verify the first `lifecycle.setup` call. That is your app's own setup secret: COHO mints it when you register the app and shows it once in the create response (regenerate it from My apps if lost). On Atrium Hosting, COHO injects the env var for you; when self-hosting, set it yourself before connecting. Set `ATRIUM_DATA_DIR` to persist connection secrets and config across restarts. Set `ATRIUM_FRAME_ANCESTORS` and `ATRIUM_PARENT_ORIGIN` to the Store origin for the environment you embed from (same value for both). Playground and production values are in [developer spec §6](../../docs/atrium-app-developer-spec.md#self-host-store-origins); when unset, these kits default to `http://localhost:4200` for local `ng serve`.

## Endpoints

Same runtime contract as the other hello samples:

- `/health`
- signed `/webhooks/atrium/*`
- signed native config at `/config/schema` and `/config`
- signed iframe quick view at `/ui`
- `POST /steps/order`, the quick view's own save for its checklist order, authorised by a short-lived page token the server mints into the page at launch
- external app-owned page at `/configure`

COHO opens `/ui` and `/configure` with a short-lived signed launch URL that includes `connectionReference`, `atriumUsageToken` (person + organisation + connection JWT), and `atriumSignature`. Prefer `Authorization: Bearer <atriumUsageToken>` for interactive Public API calls from the quick view; keep the connection `apiKey` from `lifecycle.setup` for background/webhooks. See [developer spec §6 / §8](../../docs/atrium-app-developer-spec.md).

For local Store registration, use [`manifest.example.json`](./manifest.example.json).

Signature verification is pinned to the published test vectors in the [app developer spec](../../docs/atrium-app-developer-spec.md#311-signature-test-vectors).

## Design

`design/` holds the COHO design guide for Atrium apps (`design.md`), the log of gaps builders have hit and what was done about each (`design-gaps.md`), COHO's stylesheet (`coho.css`), the reorder script (`reorder.js`), a prebuilt icon sprite (`icons.svg`), the checker (`check.cjs`), the icon check (`check-icon.cjs`), the icon maker (`make-icon.cjs`) and the screenshot capture (`capture-screenshot.cjs`). `/ui` and `/configure` are built from it: `src/ui.html` and `src/configure.html` link `/design/coho.css` and use only the parts the guide documents, and `/ui` links `/design/reorder.js` for its checklist. Read [`AGENTS.md`](./AGENTS.md) before changing any UI, and run `npm run check:design` before finishing. The folder is generated from `docs/design/atrium` in HouseShare; do not edit it here.

## Store listing

Partners edit listing fields in Atrium (Build an app / Edit listing). The committed [`store/`](./store/) folder is an **optional** example for staging an icon and copy before upload; COHO seed apps use it as an internal handoff.

If you use it: produce assets as section 20 of the guide describes. `npm run make:icon -- --background '#CEE2FF' --glyph icon-house` composes an icon when no image model is available (quote the hex, or pass bare `CEE2FF`). Capture the card picture only with a signed `/ui` launch URL after a local connection exists (`npm run screenshot -- '<signed-launch-url>' store/screenshot.png` — see developer spec §6 and `registerQuickView` in `src/server.test.js`); unsigned `/ui` returns 401 and the capture tool refuses to save it. `npm run check:icon` checks the icon. The maker and the capture need `playwright` (`npm i playwright`, then `npx playwright install chromium`); the check needs only Node.

## Tests

```bash
npm test
```
