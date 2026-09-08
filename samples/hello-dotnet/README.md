# Atrium hello-dotnet

Minimal Atrium web app using ASP.NET Core Minimal API (.NET 10).

Default port: **5103** (`PORT` env override).

## Run

```bash
dotnet run --project HelloAtrium.csproj
```

`ATRIUM_SETUP_SECRET` is required for connect. Set `ATRIUM_DATA_DIR` to persist connection secrets and config across restarts. Set `ATRIUM_FRAME_ANCESTORS` to the COHO origin allowed to embed `/ui`, and set `ATRIUM_PARENT_ORIGIN` to that exact origin for the close message (for example `http://localhost:4200` in local development).

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
dotnet test HelloAtrium.Tests/HelloAtrium.Tests.csproj
```
