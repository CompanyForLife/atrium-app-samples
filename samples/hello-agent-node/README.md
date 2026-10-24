# Atrium hello-agent-node

**Class: agent (exception).** This sample has **no quick view and no app UI**.

Almost every Atrium app should start from [`hello-node`](../hello-node) (or hello-python / hello-go / hello-dotnet) and ship a `quickViewPath`. Use this sample only when the product is truly background: webhooks + Public API + optional light Store prefs, and managers never need to open a screen.

Birthday-style automation fits. Payments, reports, applicant review, multi-step setup, and one-off actions do **not** — use a web-app hello instead.

Default port: **5104** (`PORT` env override).

## Why this exists

Partner builders (and their AIs) were copying a config-only skeleton and shipping products that need UI without one. The four language hellos are the **standard** (quick view). This fifth sample is the explicit exception, with wording that says so in the README and the manifest.

## Run

```bash
npm start
```

Set `ATRIUM_SETUP_SECRET` before connect (Hosting injects it). Optional `ATRIUM_DATA_DIR` persists connection secrets and prefs.

## Endpoints

- `/health`
- signed `/webhooks/atrium/*` (setup, disconnect, events)
- signed native light config at `/config/schema` and `/config`

There is **no** `/ui` and **no** `/configure`. The Store will not offer **Open quick view**.

For local Store registration, use [`manifest.example.json`](./manifest.example.json) — note `quickViewPath` is omitted on purpose.

Signature verification matches the [app developer spec](../../docs/atrium-app-developer-spec.md#311-signature-test-vectors).

## Tests

```bash
npm test
```
