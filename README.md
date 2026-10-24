# COHO Atrium — app samples

Starter pack for building an Atrium app that COHO can connect, trigger, and display.

## Docs

- [App developer spec](docs/atrium-app-developer-spec.md) — runtime contract (manifest, webhooks, health, config, quick view, rate limits)
- [Scalar COHO Public API 1.1](https://api.coho.life/scalar) — interactive API reference

## Samples

**Default class: web app** (quick view at `/ui`). Start here for almost every product.

| Folder | Class | Language | Default port |
|---|---|---|---|
| [samples/hello-node](samples/hello-node) | Web app | Node 20+ | 5100 |
| [samples/hello-python](samples/hello-python) | Web app | Python 3 (stdlib) | 5101 |
| [samples/hello-go](samples/hello-go) | Web app | Go (stdlib) | 5102 |
| [samples/hello-dotnet](samples/hello-dotnet) | Web app | .NET minimal API | 5103 |
| [samples/hello-agent-node](samples/hello-agent-node) | **Agent (exception)** | Node 20+ | 5104 |

`hello-agent-node` is the only sample with **no UI**. Use it only for true background automation (webhooks + Public API + optional light Store prefs). Read its README before copying it.

Pick a web-app hello for your language, register a **private** app in the Store with the sample base URL and `manifest.example.json`, then connect.

## Quick-view CSP (Hosting)

On Atrium Hosting, COHO injects `ATRIUM_FRAME_ANCESTORS` (full CSP allowlist) and `ATRIUM_PARENT_ORIGIN` (exact Store origin for that environment). Treat those as the source of truth — do not hardcode Store domains in the image. Domain moves are a Hosting redeploy, not an app rebuild. When unset (local), fall back to `http://localhost:4200` only.
