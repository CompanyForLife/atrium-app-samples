# Atrium hello-go

**Class: web app (default).** Minimal Atrium app with a quick view at `/ui`, using
Go stdlib (`net/http`, `crypto/hmac`). It is the second-language Hosting proof
after the Node birthday agent.

Start here for almost every product. For the rare background-only exception (no UI), see [`hello-agent-node`](../hello-agent-node).

Default port: **5102** (`PORT` env override).

## Run

```bash
go run .
```

`ATRIUM_SETUP_SECRET` is required. Set `ATRIUM_DATA_DIR` to persist connection
secrets and config across restarts. The hosted container mounts its per-app EFS
access point there. On Atrium Hosting, COHO injects `ATRIUM_FRAME_ANCESTORS` and `ATRIUM_PARENT_ORIGIN` (one Store origin per environment).
Treat those as the source of truth. Local fallback when unset is `http://localhost:4200`. Set `ATRIUM_PARENT_ORIGIN` to the exact
Store origin for close postMessage (deploy-inject per env) (for example `http://localhost:4200` in local development).

## Endpoints

Same runtime contract as the Node kit:

- `/health`
- signed `/webhooks/atrium/*`
- signed native config at `/config/schema` and `/config`
- signed iframe quick view at `/ui`
- external app-owned page at `/configure`

COHO opens `/ui` and `/configure` with a short-lived signed launch URL that includes `connectionReference`, `atriumUsageToken` (person + organisation + connection JWT), and `atriumSignature`. Prefer `Authorization: Bearer <atriumUsageToken>` for interactive Public API calls from the quick view; keep the connection `apiKey` from `lifecycle.setup` for background/webhooks. See [developer spec §6 / §8](../../docs/atrium-app-developer-spec.md).

For local Store registration, use [`manifest.example.json`](./manifest.example.json).
For Labs, `scripts/provision-atrium-hello-go-labs.sh` builds the image, creates
runtime resources through the generic provisioner, and lists it at
`https://atrium-go-labs.coho.life`.
