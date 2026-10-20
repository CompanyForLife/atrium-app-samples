# COHO Atrium — app samples

Starter pack for building an Atrium app that COHO can connect, trigger, and display.

## Docs

- [App developer spec](docs/atrium-app-developer-spec.md) — runtime contract (manifest, webhooks, health, config, quick view, rate limits)
- [Scalar COHO Public API 1.1](https://api.coho.life/scalar) — interactive API reference

## Samples

| Folder | Language | Default port |
|---|---|---|
| [samples/hello-node](samples/hello-node) | Node 20+ | 5100 |
| [samples/hello-python](samples/hello-python) | Python 3 (stdlib) | 5101 |
| [samples/hello-go](samples/hello-go) | Go (stdlib) | 5102 |
| [samples/hello-dotnet](samples/hello-dotnet) | .NET minimal API | 5103 |

Pick one language, run it, register a **private** app in the Store with the sample base URL and `manifest.example.json`, then connect.

## Quick-view CSP (Hosting)

On Atrium Hosting, COHO injects `ATRIUM_FRAME_ANCESTORS` (full CSP allowlist) and `ATRIUM_PARENT_ORIGIN` (exact Store origin for that environment). Treat those as the source of truth — do not hardcode Store domains in the image. Domain moves are a Hosting redeploy, not an app rebuild. When unset (local), fall back to `http://localhost:4200` only.
