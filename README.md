# COHO Atrium — app samples

Starter pack for building an Atrium app that COHO can connect, trigger, and display.

**Canonical source:** the HouseShare repository. This repo is a published snapshot.

## Docs

- [App developer spec](docs/atrium-app-developer-spec.md) — runtime contract (manifest, webhooks, health, config, quick view, rate limits)
- [Public API endpoints](docs/public-api-endpoints.md) — convenience inventory (Scalar on the API host is authoritative)
- [Public API lifecycle](docs/public-api-lifecycle.md) — v1.0 vs v1.1

Interactive API reference: Scalar **COHO Public API 1.1** at `/scalar` on the API host.

## Samples

| Folder | Language | Default port |
|---|---|---|
| [samples/hello-node](samples/hello-node) | Node 20+ | 5100 |
| [samples/hello-python](samples/hello-python) | Python 3 (stdlib) | 5101 |
| [samples/hello-go](samples/hello-go) | Go (stdlib) | 5102 |
| [samples/hello-dotnet](samples/hello-dotnet) | .NET minimal API | 5103 |

Pick one language, run it, register a **private** app in the Store with the sample base URL and `manifest.example.json`, then connect.

## Not in this pack

Atrium Hosting internals, Store product plans, birthday/demo apps, and unpublished kits.
