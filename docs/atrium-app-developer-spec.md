# COHO Atrium — app developer spec

What you need to build an Atrium app that COHO can connect, trigger, and display.

This is the pack to send an app developer (or their AI). It is the external contract for the Atrium runtime: manifest, signed deliveries, health, Public API usage, Store logs, light config, and optional quick view.

Before a **public** catalogue listing, COHO will ask you to pass a quality-gate checklist (shared separately at listing time). Private org apps only need this runtime contract.

**Not in this spec:** COHO CLI, listing review UI, billing, how COHO staffs its own seed apps, or the internals of the Hosting control plane (ECS / ALB / provisioner). If COHO runs your image, the Dockerfile contract is §5.6.
<!-- atrium-publish:omit-start -->
Internal COHO seed staffing (own CFL repos, Node/TS, storage, Idea Factory cards): [feature-plans/atrium-seed-app-standards.md](feature-plans/atrium-seed-app-standards.md).
<!-- atrium-publish:omit-end -->

---

## 1. What an Atrium app is

An Atrium app is an **HTTPS service you run** (yourself, or later on Atrium Hosting). COHO never contains your business logic.

```text
Manager connects the app in the Store
  -> COHO POSTs signed lifecycle.setup to you
  -> you store the API key + signing secret
  -> COHO may POST signed events/schedules
  -> you call Public API v1.1 with the API key
  -> you write Store logs
  -> optional: COHO loads your quick view URL in an iframe
```

Same runtime contract for COHO-built apps, private org URL apps, and (later) Partners.

---

## 2. Manifest

Declare how COHO talks to your process. Runtime paths are relative to your
registered **base URL**. Browser-facing paths are relative to
`config.browserBaseUrl` when supplied.

```json
{
  "manifestVersion": 1,
  "health": { "path": "/health", "method": "GET" },
  "config": {
    "mode": "native+embedded+external",
    "browserBaseUrl": null,
    "externalConfigureUrl": "/configure",
    "schemaPath": "/config/schema",
    "getPath": "/config",
    "putPath": "/config",
    "quickViewPath": "/ui",
    "openPresentation": "modal"
  },
  "requestedCapabilities": ["conversations.read", "conversations.write"],
  "triggers": {
    "lifecycle": {
      "setupPath": "/webhooks/atrium/setup",
      "disconnectPath": "/webhooks/atrium/disconnect"
    },
    "schedules": [],
    "events": [
      { "key": "tenancy.started", "path": "/webhooks/atrium/triggers/event" }
    ]
  }
}
```

This sample is a **web app** (quick view). That is the default for almost every product. Match `samples/hello-node/manifest.example.json` (or hello-python / hello-go / hello-dotnet). Do **not** start from a null `quickViewPath` unless you have confirmed a true background agent — then use `samples/hello-agent-node` and read its README (§6).

| Field | Meaning |
|---|---|
| `health.path` | Unsigned `GET`. See §4. |
| `triggers.lifecycle.setupPath` | Signed `POST` on connect. **Must return 2xx** or connect rolls back. |
| `triggers.lifecycle.disconnectPath` | Signed `POST` after credentials are revoked (best-effort). Delete org-scoped data. |
| `triggers.schedules` | Opt-in. Empty = COHO will not tick you on a cron. Each entry: `key`, `cron` (5-field: minute hour day-of-month month day-of-week; `*`, lists, ranges, steps), `timezone` (IANA, default UTC), `path`. **Private / unreviewed apps:** at most 4 schedules, and no denser than hourly (minute field must be a single value). Reviewed public listings are not capped this way. |
| `triggers.events` | Opt-in. Unknown keys are ignored until COHO supports them. |
| `requestedCapabilities` | Catalogue scope ids the app requires (e.g. `conversations.write`). Legacy short names still expand. Connect fails if the connecting person cannot grant every resolved scope. See §8. |
| `config.schemaPath` / `getPath` / `putPath` | Optional app-owned **light** prefs only (a handful of scalars). Store proxies signed GET/PUT. Omit when unused. Serious UI is quick view, not this form. |
| `config.browserBaseUrl` | Public HTTPS origin for hosted app UI. Runtime webhooks and config remain on the private registered base URL. |
| `config.externalConfigureUrl` | Optional new-tab configure path on the browser base URL. |
| `config.quickViewPath` | In-COHO iframe path. **Default for almost all apps.** Omit only for rare background agents (webhooks + API + optional light prefs). See §6. |
| `config.openPresentation` | When `quickViewPath` is set: `full` \| `modal` \| `side`. Store defaults to `modal` if omitted. |

`config.mode` is one or more of `native`, `external`, `embedded`, joined with `+` when combined (for example `native+embedded`). The legacy value `both` means native + external.

Browser URLs are HTTPS only in non-local environments. Self-host runtime base
URLs are also HTTPS; COHO Hosting may mint a private HTTP runtime base URL
inside the VPC.

---

## 3. Calls COHO makes to you

### 3.1 Signed POST (lifecycle, schedules, events)

Health is **not** signed. Everything else is.

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Atrium-Signature` | `t=<unix_seconds>,v1=<hex_hmac_sha256>` |
| `X-Atrium-Connection-Reference` | Connection Guid (`D` format) |
| `X-Atrium-Delivery-Id` | Guid — treat as idempotency key; **dedupe within the 300s window** |
| `X-Atrium-Event` | `lifecycle.setup` \| `lifecycle.disconnect` \| `schedule.<key>` \| `event.<key>` |

Signed string (UTF-8): `{t}.{METHOD}.{pathAndQuery}.{connectionReference}.{rawBody}`.

- `METHOD` is uppercase (`GET`, `POST`, `PUT`).
- `pathAndQuery` is the request path plus query string, **without** `atriumSignature` (do not reorder other params).
- `connectionReference` is the connection Guid, also sent as `X-Atrium-Connection-Reference` (iframe loads put it on the query string instead of a header).
- HMAC-SHA256 with the connection **signing secret** from setup, except `lifecycle.setup`, which uses your app's **setup secret** described below (never the Public API bearer token).
- Reject timestamps more than **30 seconds in the future**. Reject timestamps more than **300 seconds in the past**.

Three details cause most verification bugs:

- Sign the **raw request body bytes** exactly as received. Do not parse and re-serialise JSON first — key order and whitespace change, and every signature then fails.
- An **empty body is valid and still signed**. Signed `GET`s (config schema, config values, quick view) still include method, path, and connection in the signed string.
- Compare digests in **constant time** (`timingSafeEqual`, `hmac.compare_digest`, `hmac.Equal`, `CryptographicOperations.FixedTimeEquals`). A `==` string compare leaks timing.

#### 3.1.1 Signature test vectors

Assert against these before you trust your implementation. Secret `atrium_test_secret`, timestamp `1767225600`, connection `11111111-1111-1111-1111-111111111111`, so the header is `t=1767225600,v1=<expected>`. For the setup row, treat this as the app's setup secret; for later rows, treat it as the connection signing secret.

| METHOD | pathAndQuery | Raw body | Expected `v1` |
|---|---|---|---|
| `POST` | `/webhooks/atrium/setup` | `{"type":"lifecycle.setup","data":{}}` | `dff6a1bb99bc74adf1c24bfbae39f9b511582c98e3eda0a520e23b37feca56df` |
| `GET` | `/config?connectionReference=11111111-1111-1111-1111-111111111111` | *(empty string)* | `7dde59340b9b657a939e69760412d0ba615a0052d74674399ba7df87f7e4b906` |
| `POST` | `/webhooks/atrium/triggers/event` | `{"type":"event.tenancy.started","data":{"name":"Zoe"}}` | `f62b7d1059edffe1c88013f0a20c9dc5a96036ed722dc71f0f9d5687bedaad90` |

Your verifier must also **reject** each of these: a tampered body, a different path or method, a `v1` that does not match, a timestamp more than 300 seconds in the past, and a timestamp more than 30 seconds in the future. COHO pins its platform verifier to these same vectors.

Envelope:

```json
{
  "deliveryId": "00000000-0000-0000-0000-000000000001",
  "occurredAt": "2026-08-07T15:00:00Z",
  "appReference": "…",
  "connectionReference": "…",
  "organisationReference": "…",
  "type": "lifecycle.setup",
  "data": { }
}
```

Return **HTTP 2xx** quickly. Do long work asynchronously. Treat `deliveryId` as idempotent.

| Your status | COHO |
|---|---|
| `2xx` | Success |
| Timeout, `408`, `429`, `5xx` | Retry with backoff, then dead-letter. On `429`, COHO honours your `Retry-After` (capped at 60s) |
| `401` / `403` / `400` | No retry |
| `404` on **setup** | Connect fails and rolls back |

Health is **app-scoped** (one probe per app base URL). After the first not-OK result the app is
degraded; after three consecutive not-OK results COHO pauses schedule/event triggers for **all**
connections of that app. Any OK result immediately clears the failure count and resumes delivery.
Disconnect may still be attempted while paused.

### 3.2 `lifecycle.setup` — app connected

COHO signs `lifecycle.setup` with your app's **setup secret**. Your process must verify that signature **before** accepting or storing anything from the request. Never authenticate setup with `data.signingSecret`: that value is untrusted until setup verification succeeds.

Read the setup secret from the environment as `ATRIUM_SETUP_SECRET` (the hello samples, the Node kit, and the Hosting task definition use that name).

**Where it comes from.** COHO mints a setup secret **per app** when the app is registered and shows it **once** in the create response (Store UI, publisher portal, Public API v1.1, and MCP registration all return it). It is never shown again on a later read.

- **Self-hosted (external URL) and Draft apps:** copy the value when you register and set it as `ATRIUM_SETUP_SECRET` on your service before connecting. Draft apps receive it alongside the one-time API key and signing secret.
- **Atrium Hosting:** COHO injects `ATRIUM_SETUP_SECRET` into your task automatically on every provision. You only need a copy if you also run the same build somewhere else.
- **Lost or leaked:** the app owner can **regenerate** it from My apps (org Store) or the publisher portal. The old value stops working immediately; hosted apps are re-provisioned with the new value; self-hosted apps must update their environment before the next connect. Regeneration does not affect connections that already completed setup.

The setup secret is only for setup, and only your app's setup — it cannot verify or forge setup for any other app. After successful setup, verify config, quick-view, lifecycle, schedule, and event requests with the per-connection `data.signingSecret`.

`data`:

```json
{
  "apiKey": "<guid>",
  "apiBaseUrl": "https://api.example.com",
  "signingSecret": "<hex>"
}
```

- `apiKey` — the **background / unattended app credential** for this install. `Authorization: Bearer <apiKey>` on Public API v1.1 and Store log/config calls. Use this for schedules, webhooks, and any work with no manager signed in. Shown once.
- `apiBaseUrl` — no trailing slash. Call `{apiBaseUrl}/v1.1/public/…`.
- `signingSecret` — verify all later signed POSTs (and signed config GET/PUT).

Store these against `connectionReference`. If you return non-2xx, COHO deletes the connection and the key.

### 3.3 `lifecycle.disconnect` — app removed

Credentials are already dead. `data` may include a reason. Delete org-scoped data you hold for that connection.

### 3.4 Schedules and events

`type` is `schedule.<key>` or `event.<key>`. Domain payloads in `data` use **references / Guids only**, never database integer ids.

Published event keys (subscribe via `triggers.events`; delivery requires the Store dispatcher):

| Key | When |
|---|---|
| `tenancy.started` | Tenancy becomes active (e.g. FUTURE to ACTIVE) |
| `tenancy.ended` | Tenancy becomes past (e.g. ACTIVE to PAST) |
| `tenancy.updated` | Manager patches tenancy details or moves the tenancy to another room |
| `onboarding.started` | Onboarding is created / first pushed |
| `onboarding.updated` | Onboarding status or step state changes |
| `onboarding.completed` | Onboarding reaches completed |
| `onboarding.cancelled` | Onboarding is cancelled |
| `property.updated` | Property listing / lettings-relevant fields change |
| `room.availability.changed` | Room availability / available-from (or equivalent) changes |
| `maintenance.created` | A maintenance issue is created (including convert-from-conversation) |
| `message.created` | A conversation message is saved as Sent (references only; no body) |
| `atrium.test` | Manager hits **Run test** in the Store (not a domain event) |

The catalogue will grow. Ignore unknown keys.

#### Event `data` shapes

`event.tenancy.started`:

```json
{
  "tenancyReference": "00000000-0000-0000-0000-000000000001",
  "propertyReference": "12-example-street-abcde",
  "activatedAt": "2026-09-17T08:00:00Z"
}
```

`event.tenancy.ended`:

```json
{
  "tenancyReference": "00000000-0000-0000-0000-000000000001",
  "propertyReference": "12-example-street-abcde",
  "endedAt": "2026-09-17T08:00:00Z"
}
```

`event.tenancy.updated`:

```json
{
  "tenancyReference": "00000000-0000-0000-0000-000000000001",
  "propertyReference": "12-example-street-abcde",
  "roomReference": "room-3",
  "updatedAt": "2026-10-05T08:00:00Z"
}
```

`event.maintenance.created`:

```json
{
  "maintenanceIssueGuid": "00000000-0000-0000-0000-000000000001",
  "jobNumber": "M0042",
  "propertyReference": "12-example-street-abcde",
  "roomReference": "room-3",
  "raisedBy": "manager",
  "severity": "medium",
  "maintenanceCategoryGuid": null,
  "tenancyTenantGuid": null,
  "createdAt": "2026-10-05T08:00:00Z"
}
```

`event.message.created`:

```json
{
  "messageGuid": "00000000-0000-0000-0000-000000000001",
  "conversationReference": "message-abcde",
  "medium": "email",
  "createdAt": "2026-10-05T08:00:00Z"
}
```

`schedule.<key>` (COHO cron tick):

```json
{
  "scheduleKey": "daily",
  "fireTime": "2026-09-17T08:00:05Z"
}
```

`tenancyReference` is the tenancy Guid. Times are UTC.


---

## 4. Health check

`GET {base}{health.path}` (default `/health`). TLS only; not HMAC-signed.

Health is **app-scoped**, not per connection. COHO probes each app base URL once and applies the
result to every connection of that app.

| Result | How |
|---|---|
| OK | HTTP `2xx` and body empty **or** `{ "ok": true }` (optional `message`) |
| Not OK | Non-2xx, or `{ "ok": false, "message": "…" }` |

| Consecutive not-OK | Effect |
|---|---|
| 1–2 | App marked **degraded**; schedule/event delivery continues |
| 3 | Schedule/event delivery **paused** for all connections of that app |
| Any OK | Failure count cleared; delivery resumes immediately |

The Store shows healthy / degraded / paused with the latest message. Catalogue listing is not filtered by health.

---

## 5. Calls you make to COHO

### 5.1 Public API v1.1

- Base: `{apiBaseUrl}/v1.1/public/`
- Auth: `Authorization: Bearer <apiKey>` from setup
- OpenAPI: [Scalar COHO Public API 1.1](https://api.coho.life/scalar) — authoritative for request/response shapes
<!-- atrium-publish:omit-start -->
- Internal inventory: [public-api-endpoints.md](public-api-endpoints.md). Lifecycle: [public-api-lifecycle.md](public-api-lifecycle.md).
- Do **not** use `/v1/public` or `/v1.0/public` (deprecated; sunset 6 October 2026). Migrate with `https://api.coho.life/docs/public-api/v1.0-to-v1.1` (source: `docs/public-api-v10-to-v11-migration.md`).
- Never use HouseShare database ids. Use Guids / references from the API.
<!-- atrium-publish:omit-end -->
- Use Guids / references from the API — never database integer ids.
- `GET /v1.1/public/conversations?afterTime=` returns conversations whose last activity is after that UTC time.
- Conversation messages include `medium` and `isAutomated`. `isAutomated` is `true` when the sender is an App Connection principal (Store-connected app), otherwise `false`.
- `POST /v1.1/public/conversations` accepts `medium` `COHO_MESSENGER` (default), `EMAIL`, `SMS`, or `WHATSAPP`. Email/SMS broadcasts require `AllowReplies=false`. SMS send calculates segments and debits landlord SMS credits server-side (optional `GET /organisation/credits?type=SMS` and `POST /organisation/sms-credit-quote` with `body` to inspect cost). Do not send client-calculated `SmsSettings`. WhatsApp needs an active org connection.
- `GET /v1.1/public/conversations/{reference}/messages?includeDrafts=true` includes Draft messages; `DELETE .../messages/{messageGuid}` removes a draft; `PATCH .../messages/{messageGuid}` updates a draft and/or promotes it to Sent.
- Property tenants, tenancy tenants, and conversation recipients expose `messagingRestricted`. Create and sent replies refuse restricted housemates (maintenance threads stay writable).
- `POST /v1.1/public/conversations/{reference}/messages` replies on an existing thread. Optional `files`, `idempotencyKey` (Redis, 24h), and per-recipient `recipients` (`sent` / `skipped` / `noEmail`). Public API send does not mark the thread read for the sender. SMS rejects attachments; WhatsApp allows at most one; email and COHO Messenger allow up to 10. Sent WhatsApp replies enqueue the existing manager WhatsApp follow-up.
- `GET /v1.1/public/conversation-merge-tags` lists standard `[COHO:...]` merge tags plus the `[COHO:CUSTOM:` prefix.
- `GET /v1.1/public/properties?propertyTags=` ANDs the listed tags against property or building tags (room tags do not match).
- `PATCH /v1.1/public/properties/{reference}` updates listing copy (headline, description, amenities, term months, bills). `PATCH .../rooms/{roomReference}` can attach already-uploaded image references to the gallery. `POST .../rooms/{roomReference}/availability` wraps `MarkAsAvailableFrom` / `MarkAsUnavailable`.
- Property tenants include `gender`, approved `occupation`, interest references, and optional profile `image.reference`. Fetch bytes with `GET /v1.1/public/images/{reference}/signed-url` (file images stay on `GET /v1.1/public/files/{reference}/signed-url`). `PATCH .../tenants/{tenancyTenantGuid}/photo` sets that photo from an uploaded image reference.
- Creating a maintenance issue accepts `files` (new upload) and `fileReferences` (already-uploaded conversation files), matching convert-from-conversation.
- Info boxes expose `managedByApp`. Only the creating App Connection (same Atrium app) may patch or delete an app-owned box; other apps receive 403.
- `POST /v1.1/public/organisation/notify-managers` sends an in-app notification (`organisation.write`) with a same-origin `linkPath` starting with `/`.
- `GET /v1.1/public/guarantors` pages organisation guarantor details (`tenancies.read`). Org-wide Right to Rent remains `GET /v1.1/public/right-to-rent/report`.
- Creating or converting a maintenance issue returns `tenantUrl` only when the issue is shared with the tenant.

### 5.2 Store logs

`POST {apiBaseUrl}/v1.1/public/atrium/logs`

Organisation-owned app registration (manager API keys; Store Build an app parity):

- `GET /v1.1/public/atrium/apps` — list apps this organisation owns
- `POST /v1.1/public/atrium/apps/external` — register self-hosted
- `POST /v1.1/public/atrium/apps/hosted` — register COHO-hosted (queues provision)
- `PATCH /v1.1/public/atrium/apps/{appReference}` — update listing (allowed while in review)
- `POST /v1.1/public/atrium/apps/{appReference}/hosted-update` — update hosted source / reprovision

Partner publisher public API is not shipped yet (manage + MCP only).
<!-- atrium-publish:omit-start -->
See [feature-plans/atrium-public-api-mcp-apps.md](feature-plans/atrium-public-api-mcp-apps.md).
<!-- atrium-publish:omit-end -->


```json
{
  "level": "info",
  "message": "Birthday messages sent",
  "deliveryId": "00000000-0000-0000-0000-000000000001",
  "detailJson": null,
  "durationMs": 120
}
```

`level`: `debug` | `info` | `warning` | `error`. Warning/error counts surface as **attention** on the connection in the Store. These logs are **not** the main COHO history table.

### 5.3 Light config (app-owned)

COHO does **not** persist customer config. The Store loads schema and values from you, and writes changes back to you, all signed with the connection signing secret (same HMAC scheme as webhooks).

Typical paths (override in the manifest):

| Method | Path | Role |
|---|---|---|
| GET | `/config/schema?connectionReference=` | JSON Schema for the Store form |
| GET | `/config?connectionReference=` | Current values |
| PUT | `/config?connectionReference=` | Persist values |

Use this only for small preference sets (subject line, send time, dry-run). Lists, reports, payments, approvals, multi-step setup, and anything a manager must click through belong in **quick view** (or an external URL) — not in this form.

### 5.3.1 Supported JSON Schema contract

COHO implements a strict subset of **JSON Schema Draft 2020-12**. Unsupported keywords are rejected with a useful error; they are never silently ignored.

Root:

| Keyword | Support |
|---|---|
| `$schema` | Optional; use `https://json-schema.org/draft/2020-12/schema` |
| `type` | Required; must be `object` |
| `title`, `description` | Optional form heading/help |
| `properties` | Required object of fields |
| `required` | Optional array of property names |
| `additionalProperties` | Optional; when supplied must be `false` |

Properties:

| Keyword | Support |
|---|---|
| `type` | Required: `string`, `boolean`, `number`, or `integer` |
| `title`, `description`, `default` | Label, help, initial value |
| `enum` | Non-empty values matching the property type; renders a dropdown |
| `format` | String only: `date` (`yyyy-MM-dd`), `time` (`HH:mm`), `email` |
| `minLength`, `maxLength`, `pattern` | String validation |
| `minimum`, `maximum` | Number/integer validation |
| `x-coho-control` | String only: `multiline` |

Every other root or property keyword is currently unsupported. In particular: nested objects/arrays, `oneOf`/`anyOf`/`allOf`, conditional schemas, remote `$ref`, custom enum labels, file inputs, and rich text.

Renderer mapping:

| Schema | COHO control |
|---|---|
| `string` | `<textbox>` |
| `string` + `x-coho-control: multiline` | `<multiline-textbox>` |
| `string` + `format` | `<textbox>` with date/time/email input type |
| `boolean` | `<checkbox>` |
| `number` / `integer` | `<numberbox>` |
| Any supported scalar + `enum` | `<dropdown>` |

Canonical example:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "title": "Birthday message settings",
  "description": "Choose what the app sends and when it runs.",
  "additionalProperties": false,
  "properties": {
    "subject": {
      "type": "string",
      "title": "Message subject",
      "description": "Subject shown to the tenant.",
      "default": "Happy birthday",
      "minLength": 1,
      "maxLength": 120
    },
    "body": {
      "type": "string",
      "title": "Message body",
      "x-coho-control": "multiline",
      "default": "Happy birthday, [COHO:TENANT:FORENAME]!",
      "minLength": 1,
      "maxLength": 2000
    },
    "dryRun": {
      "type": "boolean",
      "title": "Dry run",
      "default": false
    },
    "sendTime": {
      "type": "string",
      "title": "Send time",
      "format": "time",
      "default": "09:00"
    },
    "timezone": {
      "type": "string",
      "title": "Timezone",
      "enum": ["Europe/London", "UTC"],
      "default": "Europe/London"
    },
    "retryCount": {
      "type": "integer",
      "title": "Retry count",
      "minimum": 0,
      "maximum": 5,
      "default": 2
    }
  },
  "required": ["subject", "body", "sendTime", "timezone"]
}
```

The corresponding `GET /config` response and `PUT /config` body:

```json
{
  "subject": "Happy birthday",
  "body": "Happy birthday, [COHO:TENANT:FORENAME]!",
  "dryRun": false,
  "sendTime": "09:00",
  "timezone": "Europe/London",
  "retryCount": 2
}
```

COHO validates the schema when it is loaded and validates config against that same schema before proxying a save to your app. Your app must still validate before persistence: it owns the data and may be called independently.

### 5.4 MCP (AI access)

MCP is a capability of COHO Atrium, not a separately named product. Managers connect Claude (or similar) through their COHO account. Your **app** still integrates via Public API + this runtime contract. Do not implement a second MCP server inside the app unless you are building an AI product that happens to *use* COHO.

Registering and updating hosted apps is available over MCP. **Connecting GitHub is not** — it is an OAuth-style install that has to happen in a browser, so it stays a Store / publisher-portal action (§5.5). Once GitHub is connected, MCP registration of a private repository works exactly like a public one.

### 5.5 Private GitHub sources (Atrium Hosting)

Atrium Hosting can build from a **private** GitHub repository. COHO never holds a personal access token or deploy key: access comes from a GitHub App installation that you control and can revoke from GitHub at any time.

1. In the Store (managers) or the publisher portal (publishers), choose **GitHub repository** as the source and select **Connect GitHub**.
2. GitHub asks which account and which repositories to grant. Grant only the repositories you want COHO to build.
3. You are returned to COHO and the connection is recorded against your organisation or publisher account. One connection covers every hosted app you own.

What this means in practice:

- Register or update the app with the plain `https://github.com/<org>/<repo>` URL. There is no separate "private" flag.
- Each build mints a fresh, short-lived token from the installation. Nothing long-lived is stored, and the token never reaches your image.
- Uninstalling the App, suspending it, or removing a repository from the installation stops future builds of anything that needs it. Already-running apps keep running; the next provision fails with a message telling you to reconnect.
- Public repositories still work with no connection at all.

COHO reads only repository contents and metadata. It does not subscribe to push events, so pushing to your repository does **not** trigger a deploy — you still update the app explicitly.

### 5.6 Dockerfile contract (Atrium Hosting)

When the Store registers your app as **COHO-hosted**, CodeBuild builds your repository's Dockerfile and runs the image on Atrium Hosting. The runtime contract in §§3–5 still applies. On top of that, the image must satisfy:

| Requirement | Detail |
|---|---|
| Platform | `linux/amd64` (Hosting builds with `--platform linux/amd64`). |
| Listen port | Honour `PORT`. Hosting sets `PORT=8080` and maps container port `8080`. Listening on both your local default and `8080` is fine. |
| Data directory | Persist under `ATRIUM_DATA_DIR` (Hosting sets `/data`). That path is an EFS mount and must survive re-provision. |
| Process UID/GID | Hosting runs the task as **UID 65532 and GID 65532**, matching the `/data` EFS access point. Dockerfile `USER` is overridden. |
| Setup secret | Read `ATRIUM_SETUP_SECRET` from the environment. Hosting injects it; do not bake it into the image. |
| Frame ancestors | Read `ATRIUM_FRAME_ANCESTORS` and set `Content-Security-Policy: frame-ancestors …` from it on quick-view HTML. Hosting injects **one** Store origin for that environment (e.g. `https://applabs.coho.management` on Labs). Do **not** hardcode a domain list in your image. |
| Parent origin | Read `ATRIUM_PARENT_ORIGIN` for `atrium.quickView.close` postMessage. Hosting injects the **same** Store origin as `ATRIUM_FRAME_ANCESTORS`. |

**Why Hosting sets 65532:** the `/data` volume is an EFS access point owned by `65532:65532`. ECS on EC2 chowns an empty mount to the task user. If the process ran as another UID (Node `USER node` at 1000, Microsoft aspnet `USER app` at 1654), the task never starts: `CannotCreateContainerError` / `lchown ... operation not permitted`, and provision times out as Failed. Hosting therefore sets the ECS container `user` to `65532:65532` so those Dockerfiles still boot. Access points also reject `lchown` to the same UID, so Hosting creates `/{app}/.keep` owned by 65532 on the filesystem before the first real task so Docker skips copy+chown on an empty volume. Keep application files readable by that user (avoid `chmod 700` trees owned only by another UID). Writing belongs under `ATRIUM_DATA_DIR` (`/data`).

`samples/atrium/hello-go` already uses distroless `nonroot` (65532). You do not need to remap `USER` in the Dockerfile.

Self-hosted apps ignore this section — you own the process and the disk.

---

## 6. How the app appears in COHO

**Default: web app with a quick view.** If a manager must click, fill a form, approve something, pay, or view a report inside COHO, set `quickViewPath` (and usually `openPresentation`). Native Store config is only for a handful of scalar prefs. Background-only agents are a rare exception (roughly under 5% of apps).

Decision rule:

| Manager needs to… | Surface |
|---|---|
| Open a screen, run a workflow, see a report, collect payments, review applicants, or do one-off actions | **Quick view** (`quickViewPath`) and/or **external URL** |
| Flip a few prefs (send time, dry-run, subject line) and leave the app running | Optional **light config** (§5.3) *in addition to* the above when needed |
| Never open the app — pure background automation only | **Agent** (omit `quickViewPath`) — justify this explicitly |

### Quick view (iframe) — default

Set `config.quickViewPath`. Self-hosted apps resolve it against the registered
base URL. Hosted apps with browser UI set `config.browserBaseUrl`, and COHO
resolves quick view and external config paths against that public HTTPS origin
while runtime calls stay private. Absolute URLs are allowed only on the selected
browser origin. COHO loads the page in an iframe after minting a short-lived
signed launch URL (`GET`, empty body) with:

| Query | Role |
|---|---|
| `connectionReference` | Which org connection opened |
| `atriumUsageToken` | Short-lived JWT: signed-in **person + organisation + connection** (≈15 minutes). Use as `Authorization: Bearer` for interactive Public API calls. |
| `atriumSignature` | HMAC over the launch GET (same scheme as other signed GETs) |

Verify `atriumSignature` the same way as other signed GETs. Read person/org from the usage JWT claims (`personReference`, `organisationReference`, `connectionReference`) after verifying it with COHO — do not trust unsigned query params for identity.

You must:

- Send `Content-Security-Policy: frame-ancestors …` using **`ATRIUM_FRAME_ANCESTORS`** when set (do not use a bare `*`). On Atrium Hosting, COHO injects **one** Store origin for that environment into the container — treat it as the source of truth. The same Docker image works everywhere because each env gets its own value; a domain move is a Hosting redeploy + re-provision, not an app rebuild. Self-hosting: set `ATRIUM_FRAME_ANCESTORS` (and usually `ATRIUM_PARENT_ORIGIN`) to the Store origin you embed from (ask COHO / copy from Hosting). Local-only fallback when unset may be `http://localhost:4200`.
- Use **`ATRIUM_PARENT_ORIGIN`** as the exact target for `atrium.quickView.close` postMessage (Hosting sets it to the same origin as `ATRIUM_FRAME_ANCESTORS`).
- Treat the page as **third-party chrome** — no requirement to match COHO CSS.
- Never put the API key or signing secret in the query string. The launch signature is not a substitute for checking method, path, and connection.
- For interactive UI calls, prefer `Authorization: Bearer <atriumUsageToken>`. Effective scopes are **connection grant ∩ opening person's role**. Keep the connection API key for background/webhooks only.

`lifecycle.setup` does **not** carry iframe parents (connect is the wrong place to pin CSP — a domain move should not require reconnect). Hosting injects `PORT`, `ATRIUM_DATA_DIR`, `ATRIUM_SETUP_SECRET`, `ATRIUM_FRAME_ANCESTORS`, and `ATRIUM_PARENT_ORIGIN` into the container at provision time.

Thin `postMessage` bridge (parent is COHO):

| Message `type` | Direction | Role |
|---|---|---|
| `atrium.quickView.close` | app → COHO | Close the shell |

Resize, open-full-app, and toast are reserved on the same bridge; do not invent parallel channels.

### External URL

`externalConfigureUrl` opens in a **new tab** through the same short-lived signed
launch flow as quick view (including `atriumUsageToken`). Verify the `GET`
signature before showing connection-specific UI. Use this for an existing SaaS
dashboard, or alongside quick view — not as a substitute for skipping UI when
managers still need to work in the product.

### Light config in the Store

Optional JSON Schema form, proxied to you (§5.3). Flat scalars only. Never use
this as the main product surface.

### Agent (no UI) — rare exception

Omit `quickViewPath` only when the product is truly background: webhooks + Public
API + optional light prefs, and managers never need to open a screen. Birthday-style
message senders fit; payments, reports, applicant review, multi-step setup, and
one-off actions do **not**. The Store will not offer **Open quick view**. If you
omit `quickViewPath`, write down why the product has no interactive manager surface
before you list.

Reference sample (exception only): [`samples/hello-agent-node`](../samples/hello-agent-node).
Do **not** start from it unless you have confirmed the product has no manager UI.
The four language hellos (`hello-node`, `hello-python`, `hello-go`, `hello-dotnet`)
are the standard web-app starters.

### Your Store card

The Store shows each app as a card. The card picture is the app's **first screenshot**, with the app name over a fade at the bottom. An app with no screenshot gets a coloured card based on its name, so it still looks tidy, but a screenshot shows people what they are getting.

- Make the first screenshot the screen that best shows what the app does. 1440 x 900 works well.
- Keep the key content in the top two thirds. The bottom third fades to a dark colour behind the app name.
- Show the app itself, not a sign-in, error or empty screen.
- The card shows the first two lines of the short description, so lead with the benefit.
- The icon is a square PNG, at least 512 x 512, and the picture fills the whole canvas. Do not add rounded corners, a border, a shadow or padding, and do not put a rounded icon on a coloured square: the corners would show. Transparent corners show the card colour behind. COHO rounds the corners itself. With no icon, the card shows the app's initials.
- The Build an app form warns when an icon has obvious corners.

<!-- atrium-publish:omit-start -->
Internal: screenshots cannot be set through the listing update yet. `AtriumAppListingUpdatePost` has no screenshot field, and `ScreenshotUrlsJson` is only read. Until the backend adds it, listings get screenshots through seed or ops work. The internal ADK ships `docs/design/atrium/tools/capture-screenshot.js` to take the picture.
<!-- atrium-publish:omit-end -->

---

## 7. Rate limits

| Surface | Limit (today) | Partition |
|---|---|---|
| Public API (`public-api` policy) | 100 requests / minute | Client IP |
| MCP (`X-Coho-Api-Client` only) | 100 requests / minute | User id, else IP |
| COHO → your app | Retries on `429` (honours `Retry-After`, capped at 60s); then dead-letter | Per delivery |

There is **no per-connection Atrium quota** yet. Do not assume a private bucket. HTTP `429` from Public API should be retried with backoff, same as COHO retries `429` from you.

WAF/IP blocks on the public API hostname still apply. Auth endpoints and Find-a-Home enquiry limits are unrelated to Store apps.

---

## 8. Permissions (high level)

At connect, COHO mints a **background app token** — a machine principal credential (`AppConnection`) delivered once in `lifecycle.setup` as `apiKey`. It is a Public API key backed by a private role holding exactly the requested catalogue scopes, and it is revoked on disconnect. It is **not** a fake manager user (`ATRIUM_USER` is not the model). Schedules and other unattended work use this key with no manager signed in.

- Declare `requestedCapabilities` as catalogue scope ids (e.g. `conversations.write`, `tenants.read`). Legacy short names (`conversations`, `settlements`, …) still expand.
- Connect fails if the connecting person cannot grant every resolved scope. The credential is minted with exactly that set.
- The Store shows requested, granted, pending, and unsupported scopes.
- A manifest update never expands an existing key automatically. Existing grants keep working and newly requested calls return `403` until a manager who can grant those scopes reviews and approves the exact additive delta in Store.
- Approval updates the existing key's role in place, is audited, and takes effect on the next API request. It does not rotate credentials or rerun `lifecycle.setup`. Disconnect/connect remains the credential-rotation path.
- Scope removal is not automatic. A future explicit downgrade/revoke flow owns that case.

**Interactive open (quick view / external configure):** COHO also mints a short-lived **usage JWT** (`atriumUsageToken`) bound to the signed-in manager, organisation, and connection. Public API accepts that Bearer as well as the connection API key Guid. On each usage-token request, effective scopes are recomputed as **connection scopes ∩ person scopes** (so a restricted manager cannot outrun their role through an org-installed app). Background triggers keep using the connection `apiKey` only.

**Install scope:** Connect can be organisation-wide (default) or **personal** (installer only). Organisation installs may also set a person allow-list; when the allow-list is empty, any member with Store access can open the app. Personal installs keep the org background `apiKey` for schedules/webhooks, but only the installing manager appears in My apps and can open the interactive UI. That is the dual-credential model: background org key + interactive person usage JWT.

**COHO staff signal:** When the opening manager is a COHO super-admin, the usage JWT and Public API principal include claim `isCohoStaff=true`. This is a staff-only UX signal for in-app admin tools — not a grantable catalogue scope, and never present on the machine `apiKey`.

You cannot outrun the connecting manager's organisation permissions on connect, and you cannot outrun the *opening* manager's permissions on interactive usage.

Managers can review which Public API routes an install has called with its background connection key under **My apps → Data access** (last 30 days).

### 8.1 Scope ids for common Public API routes

Missing scope returns **403**. Stacked `[RequirePublicApiScope]` attributes on one action **OR**. Authoritative per-action attributes live on the V11 controllers; Scalar lists required scopes on each operation (description + `x-required-scopes`).

| Route | Scope(s) |
|---|---|
| `GET /conversations`, `GET /conversations/{reference}`, `GET /conversations/{reference}/messages`, `GET /conversations/recipients`, `GET /conversation-templates`, `GET /conversation-merge-tags` | `conversations.read` |
| `POST /conversations`, `POST /conversations/{reference}/messages`, `PATCH /conversations/{reference}/messages/{messageGuid}`, `POST /conversations/{reference}/read`, `DELETE /conversations/{reference}/messages/{messageGuid}` | `conversations.write` |
| `GET /organisation/credits` | `organisation.read` **or** `conversations.read` |
| `POST /organisation/sms-credit-quote` | `conversations.read` |
| `GET /maintenance`, `GET /maintenance/categories` | `maintenance.read` |
| `POST /maintenance`, `POST /maintenance/convert-from-conversation` | `maintenance.write` (convert also requires `conversations.write` in-action) |
| `POST /actions` | `actions.write` |
| `GET /calendar/items` | `calendar.read` |
| `GET /calendar/maintenance-issues` | `maintenance.read` |
| `GET /properties`, `GET /properties/{propertyReference}/info-boxes/overview` | `properties.read` / `info_boxes.read` (info-boxes) |
| `GET /properties/{propertyReference}/tenants` | `tenants.read` |
| `GET /tenancies/{guid}` | `tenancies.read` |
| `GET /rent-due-records` | (core Public API key; rent payment writes need `rent_collection.write`) |

Full catalogue ids appear in the Store capability picker (`conversations.read` / `conversations.write`, `tenants.read`, `tenancies.read`, `properties.read` / `properties.write`, `maintenance.read` / `maintenance.write`, `actions.read` / `actions.write`, `calendar.read` / `calendar.write` / `calendar.delete`, `organisation.read` / `organisation.write`, and others).

### 8.2 Messaging notes for apps

- Create mediums: `COHO_MESSENGER` (default), `EMAIL`, `SMS`, `WHATSAPP`. Email and SMS are broadcasts (`AllowReplies` false). SMS send prices itself (segments + credit debit). WhatsApp requires an active org WhatsApp connection.
- WhatsApp is billed by Meta to the landlord (no COHO credit balance). COHO credits (SMS and other types) are on `GET /organisation/credits` (optional `?type=SMS`). Optional SMS cost preview: `POST /organisation/sms-credit-quote` with telephone numbers and `body` (COHO returns `numSmsSegments` and `creditsRequired`).
- Tenant `messagingRestricted` is exposed on tenants and conversation recipients. Create and sent replies refuse restricted housemates (maintenance threads stay writable).
- Drafts: `POST .../messages` with `status: draft` returns 201. List with `includeDrafts=true`. Delete with `DELETE .../messages/{messageGuid}` (drafts only). Promote/send a draft with `PATCH .../messages/{messageGuid}` (`status: sent`, optional body update). Drafts do not bump thread activity until promoted and stay out of the default Sent-only list.

---

## 9. Official connecting kit (starter samples)

This spec, the signature test vectors (§3.1.1), and the hello-world samples are the **official Atrium connecting kit**. There is **no npm / NuGet / PyPI SDK package** — by design. Copy a hello, keep the signature verify + lifecycle paths, delete what you do not need. Public snapshot: [CompanyForLife/atrium-app-samples](https://github.com/CompanyForLife/atrium-app-samples).

| Sample | Class | Language |
|---|---|---|
| `samples/hello-node` | Web app (default) | Node 20+ |
| `samples/hello-dotnet` | Web app (default) | .NET minimal API |
| `samples/hello-python` | Web app (default) | Python 3, standard library only |
| `samples/hello-go` | Web app (default) | Go, standard library only |
| `samples/hello-agent-node` | **Agent (exception)** | Node 20+ |

The four language hellos implement the same **web app** surface: health, signed lifecycle webhooks, signed triggers, native config routes with a schema from §5.3.1, optional disk persistence (`ATRIUM_DATA_DIR`), quick view (`/ui`), external configure (`/configure`), and Public API capability probes in the quick view.

`hello-agent-node` is the only starter **without** a UI. Use it only for true background agents (§6). Its README states that explicitly — copy a web-app hello unless you have a written reason not to.

We deliberately do not publish a language package. The runtime contract is a few hundred lines in any language, most of which is HTTP routing you already have in your own stack, and a library that owns your server is useless if you are adding Atrium to an existing app. Verifying signatures is the one part where a subtle mistake is a security hole rather than a bug, which is why it has published test vectors instead of a package.

Start from a hello sample. Richer demo apps (schedules, persistence beyond the sample state file, real product workflows) may exist for COHO dogfooding; they are not part of the supported external starter set. In-repo `kits/atrium-node` is birthday-dogfood only and not a supported partner interface.

Samples target **self-host** by default. If COHO runs your image on Atrium Hosting, follow the Dockerfile contract in §5.6; if your source lives in a private repository, see §5.5.

---

## 10. Local loop (until Hosting exists)

**Preferred (draft key first):**

1. In a feature-flagged Store org, register a **Draft** app (name only). Copy the one-time API key, signing secret, API base URL, connection reference, and setup secret.
2. Build your app against that Public API key (no temporary org key).
3. Serve `/health` and the lifecycle paths locally with `ATRIUM_SETUP_SECRET` set to the copied setup secret; expose HTTPS if the API cannot reach localhost (tunnel).
4. On **My apps**, set the Base URL to activate — COHO POSTs `lifecycle.setup` (signed with your setup secret) with the same credentials; persist the signing secret if your process did not already hold it.
5. Confirm health, a test event or a real `tenancy.started`, logs in the Store, then disconnect when done.
6. Before you ask for a public listing, take a screenshot of your main screen (see "Your Store card" in section 6).

**Classic (URL first):**

1. Serve your app on localhost with `/health` and the lifecycle paths.
2. Expose HTTPS if the API cannot reach localhost (tunnel).
3. Register a **private** external app: name + base URL + manifest. Copy the one-time setup secret and restart your app with it as `ATRIUM_SETUP_SECRET`.
4. Connect — you must receive `lifecycle.setup` and persist secrets.
5. Confirm health, a test event or a real `tenancy.started`, logs in the Store, then disconnect.

---

## 11. Out of scope for this pack

- How we run ECS/Fargate or issue a COHO git repo
- Public listing pipeline (draft → review → listed) beyond "you will be asked to pass a quality-gate checklist"
- Paid apps / Stripe
- Injecting UI into existing COHO panels (not v1)

If you implement health, setup, disconnect, one trigger, Public API calls, logs, and (for almost all apps) `quickViewPath` plus `frame-ancestors`, you can get most of an app done.
