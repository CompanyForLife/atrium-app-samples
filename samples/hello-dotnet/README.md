# Atrium hello-dotnet

Minimal self-host Atrium app using ASP.NET Core Minimal API (.NET 10). In-memory secrets and config with HMAC verification.

Default port: **5103** (`PORT` env override).

## Run

```bash
dotnet run --project HelloAtrium.csproj
```

## Endpoints

Same contract as the other hello samples: `/health`, signed `/webhooks/atrium/*`, and optional `/config` routes.

Signature verification is pinned to the published test vectors in the [app developer spec](../../docs/atrium-app-developer-spec.md#311-signature-test-vectors).
