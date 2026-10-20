# Atrium hello-dotnet

Minimal Atrium web app using ASP.NET Core Minimal API (.NET 10).

Default port: **5103** (`PORT` env override).

## Run

```bash
dotnet run --project HelloAtrium.csproj
```

Your process reads `ATRIUM_SETUP_SECRET` to verify the first `lifecycle.setup` call. That is your app's own setup secret: COHO mints it when you register the app and shows it once in the create response (regenerate it from My apps if lost). On Atrium Hosting, COHO injects the env var for you; when self-hosting, set it yourself before connecting. Set `ATRIUM_DATA_DIR` to persist connection secrets and config across restarts. On Atrium Hosting, COHO injects `ATRIUM_FRAME_ANCESTORS` and `ATRIUM_PARENT_ORIGIN` (one Store origin per environment). Treat those as the source of truth — do not bake a domain list into the image. Local-only fallback when unset is `http://localhost:4200`.

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

If you add a Dockerfile for **Atrium Hosting**, you can keep Microsoft aspnet `USER app`. Hosting runs the task as UID/GID **65532** to match the `/data` mount — see [app developer spec §5.6](../../docs/atrium-app-developer-spec.md#56-dockerfile-contract-atrium-hosting).

## Tests

```bash
dotnet test HelloAtrium.Tests/HelloAtrium.Tests.csproj
```
