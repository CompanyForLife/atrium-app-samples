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

### Manifest

Paste [`manifest.example.json`](./manifest.example.json) into Build an app and keep editing the Draft in Atrium. The scope-upgrade example demonstrates requesting an additional capability.

Signature verification is pinned to the published test vectors in the [app developer spec](../../docs/atrium-app-developer-spec.md#311-signature-test-vectors).

## Design

Use the [public Atrium design system](https://docs.coho.life/atrium-design/) and its [AI guidance](https://docs.coho.life/atrium-design/llms-full.txt). Both pages use the unmodified public stylesheet in `assets/atrium.css`, system fonts and `at-*` classes. The host theme maps to `data-color-mode`. Read [AGENTS.md](./AGENTS.md) before UI work.

The checklist uses keyboard-accessible Move up/Move down controls. Saves use an app-owned page token and retain the previous order on failure. COHO supplies the quick-view close control.

## Store listing

Edit listing fields in Atrium (Build an app / Edit listing). The optional [store/](./store/) folder stages example copy before upload. See the developer spec's Your Store card section for icon and screenshot requirements.

## Container

Build from this folder with `docker build -t atrium-hello-node .`. The image uses only this starter's package, source and public assets. No surrounding checkout is required.

## Tests

```bash
npm test
```
