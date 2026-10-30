# COHO Atrium — app developer spec

What you need to build an Atrium app that COHO can connect, trigger, and display.

This is the pack to send an app developer (or their AI). It is the external contract for the Atrium runtime: manifest, signed deliveries, health, Public API usage, Store logs, light config, and optional quick view.

Before a **public** catalogue listing, COHO will ask you to pass a quality-gate checklist (shared separately at listing time). Private org apps only need this runtime contract.

**Not in this spec:** COHO CLI, listing review UI, how COHO staffs its own seed apps, or the internals of the Hosting control plane (ECS / ALB / provisioner). If COHO runs your image, the Dockerfile contract is §5.6. Catalogue pricing and payments for publishers are in §6 (Pricing and payments).

## Default builder workflow (Draft first)

Use this order almost every time — including when an AI (Claude / Cursor / similar) is driving. **Do not start with Hosting, GitHub Connect, or a zip** unless the builder already has a working Draft and explicitly wants to convert it.

1. **Explain the idea** (what the manager should do in COHO).
2. **Clarify** only what you need (surfaces, events, Public API capabilities). Prefer a web app with a quick view (§6).
3. **Register a Draft** in the Store (**Build an app** → Draft): name is enough. Copy the one-time API key, signing secret, API base URL, connection reference, and setup secret from the Draft creation response.
4. **Give it a Store icon** unless one already exists. Produce an icon (design kit §20.1 / hello-node `npm run make:icon` or an image model) and upload it on Build an app / Edit listing. Do **not** leave the initials tile (e.g. "AL", "CB") — that is the no-icon fallback, not a finished look. See §6 Your Store card. You edit your own listing in the Store; a local `store/` folder is optional, not required.
5. **Build against that Draft** (local process + Public API). Tell the builder they can try it in COHO once health / lifecycle / quick view work — see §10.
6. **Only then** ask about converting Draft → real: set a Base URL (self-host), or choose Hosted source (public GitHub / private GitHub + Connect / zip) per §5.5–§5.6.
7. **Before a public catalogue listing:** fill the **publisher profile** once (country, support site and hours, privacy policy URL, sub-processors URL, licence — Atrium standard or your own terms), finish Edit listing (data location, a plain-English reason for each requested permission, screenshots, copy), then **Submit for approval**. Partner and hosted apps stay Draft until that submit; public-intent submissions remain `InReview + Private` until approval. Organisation-owned self-hosted apps may already be `Listed + Private` for dogfood — see §6 Your Store card.

Connecting GitHub or pasting a repo URL is step 6, not step 1. "Connected to GitHub" alone is not a source — the hosted form still needs the concrete `https://github.com/<org>/<repo>` URL (and Selected-repos access for private repos).

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
  },
  "operations": [
    {
      "name": "list",
      "path": "/operations/list",
      "method": "GET",
      "description": "List records for the organisation",
      "effect": "read"
    }
  ]
}
```

This sample is a **web app** (quick view). That is the default for almost every product. Match `samples/hello-node/manifest.example.json` (or hello-python / hello-go / hello-dotnet in atrium-app-samples). Starter manifests may still say `"mode": "both"` — that is the legacy spelling of native + external for the same web-app surface; `"native+embedded+external"` here is the explicit form. Do **not** start from a null `quickViewPath` unless you have confirmed a true background agent — then use `samples/hello-agent-node` and read its README (§6).

| Field | Meaning |
|---|---|
| `health.path` | Unsigned `GET`. See §4. |
| `triggers.lifecycle.setupPath` | Signed `POST` on connect. **Must return 2xx** or connect rolls back. |
| `triggers.lifecycle.disconnectPath` | Signed `POST` after credentials are revoked (best-effort). Delete org-scoped data. |
| `triggers.schedules` | Opt-in. Empty = COHO will not tick you on a cron. Each entry: `key`, `cron` (5-field: minute hour day-of-month month day-of-week; `*`, lists, ranges, steps), `timezone` (IANA, default UTC), `path`. **Private / unreviewed apps:** at most 4 schedules, and no denser than hourly (minute field must be a single value). Reviewed public listings are not capped this way. |
| `triggers.events` | Opt-in. Unknown keys are ignored until COHO supports them. |
| `requestedCapabilities` | Catalogue scope ids the app requires (e.g. `conversations.write`). Legacy short names still expand. Connect fails if the connecting person cannot grant every resolved scope. See §8. |
| `operations` | Optional. Named endpoints COHO may call on your app through the app-operations gateway (Public API + MCP). See §3.5. Omit or `[]` when unused. |
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
| `room.availability.changed` | Room `AvailableFrom` is persisted with a new value (any manager / Public API / occupancy path that saves that change) |
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

### 3.5 App operations gateway (optional)

Declare operations in the manifest so managers and integrations can call your app **through COHO** (one Public API / MCP connection — your app is never a second MCP endpoint).

Each operation:

| Field | Rules |
|---|---|
| `name` | Lowercase letter, then letters/digits/underscores (max 64). Callers use this name. |
| `path` | Relative path on your base URL (e.g. `/operations/list`). Same signing as config. |
| `method` | `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`. |
| `description` | 8–500 characters; written for an AI reader. |
| `effect` | **Required.** `read`, `write`, or `delete` — no default. Omit or mistype and the manifest write fails. MCP confirms write/delete before calling. |

**Public API:** `METHOD /v1.1/public/apps/{appReference}/{name}` with scope `apps.operations`. `appReference` is your app Guid or `ShortName`. The HTTP method must match the manifest. Org API keys may call operations only on **unrestricted organisation** installs. Personal installs and organisation installs with a person allow-list need a manager session (MCP / manage), not a bare API key.

**MCP:** `list_app_operations` / `call_app_operation` (manager session). Write/delete effects ask for confirmation.

**Your handler:** verify `X-Atrium-Signature` the same way as config GET/PUT (signed string includes method, path+query with `connectionReference`, connection Guid, raw body). Return JSON. Timeout 10s; no retries. Max 50 operations per manifest.

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
- Use Guids / references from the API — never database integer ids.
- `GET /v1.1/public/conversations?afterTime=` returns conversations whose last activity is after that UTC time.
- Conversation messages include `medium` and `isAutomated`. `isAutomated` is `true` when the sender is an App Connection principal (Store-connected app), otherwise `false`.
- `POST /v1.1/public/conversations` accepts `medium` `COHO_MESSENGER` (default), `EMAIL`, `SMS`, or `WHATSAPP`. Email/SMS broadcasts require `AllowReplies=false`. SMS send calculates segments and debits landlord SMS credits server-side (optional `GET /organisation/credits?type=SMS` and `POST /organisation/sms-credit-quote` with `body` to inspect cost). There is no client `SmsSettings` field on create. WhatsApp needs an active org connection.
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
- Maintenance issues include `assignedOrganisationPersonGuid`, `supplierGuid` and `updated`; `GET maintenance` accepts `detailedStatuses`. Viewings include their state (`agreedDate`, `invitedByManager`, `applicantResponse`, `managerResponse`, `outcome`, `proposedDateSet`), assignee and timestamps. Tenancy tenants include `cohoAccountStatus` and `dateInvitedToCoho`. `GET organisation/users` includes `personReference`, which matches the usage token's `personReference` claim.

### 5.2 Store logs

`POST {apiBaseUrl}/v1.1/public/atrium/logs`

Organisation-owned app registration (manager API keys; Store Build an app parity):

- `GET /v1.1/public/atrium/apps` — list apps this organisation owns
- `GET /v1.1/public/atrium/publisher-profile` — get Built-by / company listing disclosures
- `PATCH /v1.1/public/atrium/publisher-profile` — update company disclosures (country, support, privacy, sub-processors, licence)
- `POST /v1.1/public/atrium/apps/external` — register self-hosted
- `POST /v1.1/public/atrium/apps/hosted` — register COHO-hosted (queues provision)
- `PATCH /v1.1/public/atrium/apps/{appReference}` — update listing (data location, permission reasons, copy, icon/screenshots; allowed while in review)
- `POST /v1.1/public/atrium/apps/{appReference}/submit-for-approval` — validate disclosures and move to in_review
- `POST /v1.1/public/atrium/apps/{appReference}/hosted-update` — update hosted source / reprovision

Partner publisher public API is not shipped yet (manage + MCP only; MCP: `GetPublisherDeveloperProfile` / `UpdatePublisherDeveloperProfile`).


```json
{
  "level": "info",
  "message": "Birthday messages sent",
  "deliveryId": "00000000-0000-0000-0000-000000000001",
  "detailJson": null,
  "durationMs": 120
}
```

`level`: `debug` | `info` | `warning` | `error`. Store logs are operational history on the connection; they are **not** the main COHO history table. The customer attention red-dot is driven by live actionable states (pending permissions, setup incomplete, unhealthy, last run failed, access blocked), not by Warning/Error log volume.

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

Over MCP you can:

- Register and update self-hosted or hosted apps (org tools and partner publisher tools)
- Update listing fields including data location, permission reasons, icon, and screenshots
- Read and update the **publisher / developer profile** (company disclosures) — org: `GetAtriumPublisherProfile` / `UpdateAtriumPublisherProfile`; partner: `GetPublisherDeveloperProfile` / `UpdatePublisherDeveloperProfile`
- **Submit for approval** once disclosures are complete (`SubmitAtriumAppForApproval` / `SubmitPublisherAtriumAppForApproval`)

**Connecting GitHub is not** available over MCP — it is an OAuth-style install that has to happen in a browser, so it stays a Store / publisher-portal action (§5.5). Once GitHub is connected, MCP registration of a private repository works exactly like a public one.

To expose your own endpoints to the manager’s AI (and to Public API callers with `apps.operations`), declare them under manifest `operations` (§3.5). COHO then surfaces them as `list_app_operations` / `call_app_operation` — you do not host MCP yourself.

### 5.5 Hosted source choices (GitHub private / public / zip)

Reach this section **after** a Draft (or local self-host) already works — see **Default builder workflow** above. Hosted source is how you convert a working app onto Atrium Hosting, not how you start building.

Decide the source **before** you need a Hosting build. AI agents cannot complete GitHub App install or Connect for you — those are browser steps for a human. Connect binds the GitHub App to your COHO org or publisher; you still paste the full repository URL into the form (Connect alone does not pick a repo).

| Source | Use when | Human steps |
|---|---|---|
| **Public GitHub** | Code can be public | Register `https://github.com/<org>/<repo>` — no Connect |
| **Private GitHub** | Repo stays private | 1) **Connect GitHub** in the Store / publisher portal. 2) A GitHub **org owner** adds the repo to the COHO Atrium App under **Selected repositories** (do not switch the install to All repositories). 3) Register / rebuild |
| **Zip upload** | No GitHub, or App install cannot be changed | Upload a source zip in the Store; re-upload when the code changes |
| **Self-host** | You already run HTTPS | Register base URL + manifest; skip Hosting |

#### Private GitHub details

Atrium Hosting can build from a **private** GitHub repository. COHO never holds a personal access token or deploy key: access comes from a GitHub App installation that you control and can revoke from GitHub at any time.

1. In the Store (managers) or the publisher portal (publishers), choose **GitHub repository** as the source and select **Connect GitHub**.
2. GitHub asks which account and which repositories to grant. Grant **only** the repositories you want COHO to build (**Selected repositories**).
3. You are returned to COHO and the connection is recorded against your organisation or publisher account. One connection covers every hosted app you own — but each **new** private repo still needs adding to that Selected list by a GitHub org owner.
4. Register or update with the plain `https://github.com/<org>/<repo>` URL. There is no separate "private" flag. Register rejects a private URL when Connect is missing or the App cannot see the repo (you should not reach a generic "Provisioning failed unexpectedly" for that case).

What this means in practice:

- Each build mints a fresh, short-lived token from the installation. Nothing long-lived is stored, and the token never reaches your image.
- Uninstalling the App, suspending it, or removing a repository from the installation stops future builds of anything that needs it. Already-running apps keep running; the next provision fails with a message telling you to reconnect.
- Public repositories still work with no connection at all.
- If several COHO organisations Connect the **same** GitHub App installation, every private repository on that install’s Selected list is buildable by each of those organisations. Keep customer or partner private repos on an install that only their COHO accounts bind — do not share one installation across trust boundaries.

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
| Frame ancestors | Read `ATRIUM_FRAME_ANCESTORS` and set `Content-Security-Policy: frame-ancestors …` from it on quick-view HTML. Hosting injects **one** Store origin for that environment. Do **not** hardcode a domain list in your image. Self-host values: [§6](#self-host-store-origins). |
| Parent origin | Read `ATRIUM_PARENT_ORIGIN` for `atrium.quickView.close` postMessage. Hosting injects the **same** Store origin as `ATRIUM_FRAME_ANCESTORS`. Self-host: same table as frame ancestors. |

**Why Hosting sets 65532:** the `/data` volume is an EFS access point owned by `65532:65532`. ECS on EC2 chowns an empty mount to the task user. If the process ran as another UID (Node `USER node` at 1000, Microsoft aspnet `USER app` at 1654), the task never starts: `CannotCreateContainerError` / `lchown ... operation not permitted`, and provision times out as Failed. Hosting therefore sets the ECS container `user` to `65532:65532` so those Dockerfiles still boot. Access points also reject `lchown` to the same UID, so Hosting creates `/{app}/.keep` owned by 65532 on the filesystem before the first real task so Docker skips copy+chown on an empty volume. Keep application files readable by that user (avoid `chmod 700` trees owned only by another UID). Writing belongs under `ATRIUM_DATA_DIR` (`/data`).

`samples/hello-go` already uses distroless `nonroot` (65532). You do not need to remap `USER` in the Dockerfile.

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
| `atriumUsageToken` | Short-lived JWT: signed-in **person + organisation + connection** (≈15 minutes). Use as `Authorization: Bearer` for interactive Public API calls. Remint while open via the postMessage bridge — do not treat expiry as “close the app”. |
| `theme` | Opening manager's COHO UI theme: `light` or `dark` (from persisted `User.DarkMode`, not OS preference). Covered by `atriumSignature` — use for first paint. |
| `atriumSignature` | HMAC over the launch GET (same scheme as other signed GETs) |

Verify `atriumSignature` the same way as other signed GETs. Read person/org from the usage JWT claims (`personReference`, `organisationReference`, `connectionReference`) after verifying it with COHO — do not trust unsigned query params for identity. `theme` is a UI hint only (safe after signature verify); it is not an auth claim.

You must:

- Send `Content-Security-Policy: frame-ancestors …` using **`ATRIUM_FRAME_ANCESTORS`** when set (do not use a bare `*`). On Atrium Hosting, COHO injects **one** Store origin for that environment into the container — treat it as the source of truth. The same Docker image works everywhere because each env gets its own value; a domain move is a Hosting redeploy + re-provision, not an app rebuild.
- Use **`ATRIUM_PARENT_ORIGIN`** as the exact target for `atrium.quickView.close` postMessage (Hosting sets it to the same origin as `ATRIUM_FRAME_ANCESTORS`).
- Treat the page as **third-party chrome** — no requirement to match COHO CSS.
- Do not render the app's name as a page title. COHO's header above the iframe already shows it from the Store listing, so an `h1` with the name shows it twice. Start the page with its first panel.
- Never put the API key or signing secret in the query string. The launch signature is not a substitute for checking method, path, and connection.
- For interactive UI calls, prefer `Authorization: Bearer <atriumUsageToken>`. Effective scopes are **connection grant ∩ opening person's role**. Keep the connection API key for background/webhooks only.
- Keep the Bearer fresh for as long as the quick view stays open: listen for COHO remints and update your client. You cannot mint a usage token yourself.

#### Self-host Store origins

`lifecycle.setup` does **not** carry iframe parents (connect is the wrong place to pin CSP — a domain move should not require reconnect). Hosting injects `PORT`, `ATRIUM_DATA_DIR`, `ATRIUM_SETUP_SECRET`, `ATRIUM_FRAME_ANCESTORS`, and `ATRIUM_PARENT_ORIGIN` into the container at provision time.

When **self-hosting**, you set both env vars yourself. They are always the **same** value: the Store / manager SPA origin for the COHO environment you are embedded from. Do **not** hardcode a multi-environment list into the image, and do not use `*`.

Use **one image, different process env per deployment** (same pattern as Hosting). Playground and production are not different apps or codebases — flip the two vars (and the usual secrets / API base) when you cut over.

| COHO environment | Set both vars to |
|---|---|
| **Playground** | `https://playground.coho.life` |
| **Production** | `https://coho.life` |

Example for a Playground self-host deploy:

```bash
export ATRIUM_FRAME_ANCESTORS=https://playground.coho.life
export ATRIUM_PARENT_ORIGIN=https://playground.coho.life
```

These match what Atrium Hosting injects for that environment today. If COHO moves a Store host, Hosting apps are re-provisioned automatically; self-hosted apps update the two env vars and restart — no reconnect required.

Thin `postMessage` bridge (parent is COHO):

| Message `type` | Direction | Role |
|---|---|---|
| `atrium.quickView.close` | app → COHO | Close the shell |
| `atrium.quickView.ready` | app → COHO | Optional. Ask the host to (re)send theme after your page boots. |
| `atrium.quickView.theme` | COHO → app | `{ theme: "light" \| "dark" }`. Sent on iframe load, on `ready`, and when the manager toggles dark mode while the shell is open. |
| `atrium.usageToken.refresh` | app → COHO | Ask COHO to remint a usage JWT (optional `requestId`) |
| `atrium.usageToken` | COHO → app | Fresh `{ atriumUsageToken, expiresAt }` (optional `requestId`) — keep iframe state; do not reload |
| `atrium.usageToken.error` | COHO → app | Remint failed; tell the manager to close and reopen |

Apps may ignore theme messages. Matching COHO CSS is not required — this is optional host context for third-party chrome. Check `event.origin` against your allowed COHO parent origins before applying theme. Prefer the signed `theme` query for first paint, then listen for live updates.

COHO also remints the usage JWT proactively about every 12 minutes and when the manager’s tab becomes visible again. The Node kit helpers `subscribeAtriumQuickViewTheme` and `createUsageTokenSession` wire theme and token refresh. Resize, open-full-app, and toast remain reserved on the same bridge; do not invent parallel channels.

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

Reference sample (exception only): `CompanyForLife/atrium-app-samples` → `samples/hello-agent-node`.
Do **not** start from it unless you have confirmed the product has no manager UI.
The four language hellos (`hello-node`, `hello-python`, `hello-go`, `hello-dotnet`)
are the standard web-app starters.

### Your Store card

Register and edit your listing in the Store (Build an app / Edit listing): icon, screenshot, and copy live on the app row you own. A local `store/` folder (hello-node ships an example) is only a convenience if an AI or teammate prepares files for upload; it is not required.

The Store shows each app as a card. The card picture is the app's **first screenshot**, with the app name over a fade at the bottom. An app with no screenshot gets a coloured card based on its name, so it still looks tidy, but a screenshot shows people what they are getting.

- Make the first screenshot the screen that best shows what the app does. 1440 x 900 works well.
- Keep the key content in the top two thirds. The bottom third fades to a dark colour behind the app name.
- Show the app itself, not a sign-in, error or empty screen.
- The card shows the first two lines of the short description, so lead with the benefit.
- The icon is a square PNG, at least 512 x 512, and the picture fills the whole canvas. Do not add rounded corners, a border, a shadow or padding, and do not put a rounded icon on a coloured square: the corners would show. Transparent corners show the card colour behind. COHO rounds the corners itself.
- **Always supply an icon** when registering or editing a listing, unless one is already on the app. With no icon, the Store shows the app's initials on a coloured tile (e.g. "AL", "CB"). That fallback is temporary scaffolding only — create and upload a real icon before you invite anyone to try the app in COHO (Default builder workflow step 4; design kit §20.1).
- The Build an app form warns when an icon has obvious corners.
- Before a **public** listing can be approved, fill company-level disclosures once on the publisher profile (country, support site and hours, privacy policy URL, sub-processors URL, licence — Atrium standard or your own terms URL), plus app-level fields on Edit listing: data location (COHO-built apps default to AWS London when blank), a plain-English reason for each requested permission, name/icon/description/screenshots. Design kit §20.3 lists the copy limits; the published [listing guidelines](https://coho.life/legal/atrium-app-review-listing-guidelines/) are the product rules.

### Pricing and payments

Set price on **Build an app** / **Edit listing** (not in listing marketing copy). The Store shows the catalogue price on the card and detail page.

| Choice | What the customer sees | Notes |
|---|---|---|
| **Free** | Free | No app charge. The installing organisation still uses its shared API/MCP credit allowance for calls your app makes. |
| **Paid — flat monthly** | Your price per month (+ VAT where shown) | One amount for the organisation. |
| **Paid — per unit / month** | Your price per active unit per month (+ VAT where shown) | Units are stock rooms and properties that are not disabled. Counted when the invoice is raised. |

**Who bills.** COHO is the merchant of record. Customers pay COHO by **card**. Organisations with no card, or with BACS as the only default method, cannot install a paid app until a card is on file. Free apps do not need a card for the app itself.

**When a paid install is charged (UTC calendar months).** Connecting on days **1–14** of the month can raise an install charge for the current month. Connecting on day **15** or later: the rest of that month is free for that connection, and the first charge is on the next 1st. Charges are whole months — no day-level proration. Disconnect ends billing after the month already paid; reconnect in a month already paid for that product does not charge again.

**Your share.** Listing is free. On paid catalogue sales, the platform share is **20%** of Net Receipts; your developer share is **80%**. That split is internal bookkeeping on COHO's side (it is not a separate line on the customer's invoice). Remittance timing and tax treatment follow the Atrium Distribution & Billing Addendum.

**Price changes.** New installs pay the new price immediately. For organisations already connected, a price change takes effect on the first 1st that is at least **30 days** after you change it.

**Not at launch.** One-off payments and in-app purchases are not offered yet. Optional free trials exist as a product setting and are **off by default**.

**Private apps (not listed).** A **COHO-hosted** private app carries a **£10 / app / month** hosting seat (card required). Self-hosted private apps have no hosting seat fee; their API/MCP use still draws from the organisation's credits.

**Credits vs app price.** Every connected app (free, paid, private, COHO-built) consumes the installing organisation's shared Public API / MCP credit pool. App subscription price and usage credits are separate lines.


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

**Interactive open (quick view / external configure):** COHO also mints a short-lived **usage JWT** (`atriumUsageToken`) bound to the signed-in manager, organisation, and connection. Public API accepts that Bearer as well as the connection API key Guid. On each usage-token request, effective scopes are recomputed as **connection scopes ∩ person scopes** (so a restricted manager cannot outrun their role through an org-installed app). While a quick view stays open, COHO remints via the postMessage bridge (`atrium.usageToken`) so interactive sessions can last as long as the manager’s COHO session — apps must swap the Bearer; they cannot mint. Background triggers keep using the connection `apiKey` only.

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
| `METHOD /apps/{appReference}/{operationName}` (app operations gateway, §3.5) | `apps.operations` |

**Living full catalogue:** [atrium-requested-capabilities.md](atrium-requested-capabilities.md) lists every grantable scope id, group, and label. The Store guided manifest editor uses the same catalogue (Read/Write by area). Prefer catalogue ids over legacy short names. That markdown file is CI-checked against `CohoScopes` so new scopes show up there when they ship.

### 8.2 Messaging notes for apps

- Create mediums: `COHO_MESSENGER` (default), `EMAIL`, `SMS`, `WHATSAPP`. Email and SMS are broadcasts (`AllowReplies` false). SMS send prices itself (segments + credit debit). WhatsApp requires an active org WhatsApp connection.
- WhatsApp is billed by Meta to the landlord (no COHO credit balance). COHO credits (SMS and other types) are on `GET /organisation/credits` (optional `?type=SMS`). Optional SMS cost preview: `POST /organisation/sms-credit-quote` with telephone numbers and `body` (COHO returns `numSmsSegments` and `creditsRequired`).
- Tenant `messagingRestricted` is exposed on tenants and conversation recipients. Create and sent replies refuse restricted housemates (maintenance threads stay writable).
- Drafts: `POST .../messages` with `status: draft` returns 201. List with `includeDrafts=true`. Delete with `DELETE .../messages/{messageGuid}` (drafts only). Promote/send a draft with `PATCH .../messages/{messageGuid}` (`status: sent`, optional body update). Drafts do not bump thread activity until promoted and stay out of the default Sent-only list.

---

## 9. Official connecting kit (starter samples)

This spec, the signature test vectors (§3.1.1), and the four hello-world samples are the **official Atrium connecting kit**. There is **no npm / NuGet / PyPI SDK package** — by design. Copy a hello, keep the signature verify + lifecycle paths, delete what you do not need. Public snapshot: [CompanyForLife/atrium-app-samples](https://github.com/CompanyForLife/atrium-app-samples).

| Sample | Class | Language |
|---|---|---|
| `samples/hello-node` (atrium-app-samples) | Web app (default) | Node 20+ |
| `samples/hello-dotnet` (atrium-app-samples) | Web app (default) | .NET minimal API |
| `samples/hello-python` (atrium-app-samples) | Web app (default) | Python 3, standard library only |
| `samples/hello-go` (atrium-app-samples) | Web app (default) | Go, standard library only |
| `samples/hello-agent-node` (atrium-app-samples) | **Agent (exception)** | Node 20+ |

The four language hellos implement the same **web app** surface: health, signed lifecycle webhooks, signed triggers, native config routes with a schema from §5.3.1, optional disk persistence (`ATRIUM_DATA_DIR`), quick view (`/ui`), external configure (`/configure`), and Public API capability probes in the quick view.

`hello-agent-node` is the only starter **without** a UI. Use it only for true background agents (§6). Its README states that explicitly — copy a web-app hello unless you have a written reason not to.

We deliberately do not publish a language package. The runtime contract is a few hundred lines in any language, most of which is HTTP routing you already have in your own stack, and a library that owns your server is useless if you are adding Atrium to an existing app. Verifying signatures is the one part where a subtle mistake is a security hole rather than a bug, which is why it has published test vectors instead of a package.

Start from a hello sample. Richer demo apps (schedules, persistence beyond the sample state file, real product workflows) may exist for COHO dogfooding; they are not part of the supported external starter set. In-repo `kits/atrium-node` is birthday-dogfood only and not a supported partner interface.

Samples target **self-host** by default. If COHO runs your image on Atrium Hosting, follow the Dockerfile contract in §5.6; if your source lives in a private repository, see §5.5.

---

## 10. Local loop (Draft first; Hosting later)

This is the default local path from **Default builder workflow**. Stay here until the app works in COHO. Only then convert to Hosted (§5.5) or a lasting self-host Base URL.

**Preferred (Draft key first):**

1. In a feature-flagged Store org, register a **Draft** app (name only). Copy the one-time API key, signing secret, API base URL, connection reference, and setup secret.
2. Build your app against that Public API key (no temporary org key).
3. Serve `/health` and the lifecycle paths locally with `ATRIUM_SETUP_SECRET` set to the copied setup secret; expose HTTPS if the API cannot reach localhost (tunnel).
4. On **My apps**, set the Base URL to activate — COHO POSTs `lifecycle.setup` (signed with your setup secret) with the same credentials; persist the signing secret if your process did not already hold it.
5. Confirm health, a test event or a real `tenancy.started`, logs in the Store, then disconnect when done.
6. Before you ask for a public listing, take a screenshot of your main screen (see "Your Store card" in section 6).
7. When ready for Atrium Hosting: pick public GitHub, private GitHub (Connect + Selected repos + paste the repo URL), or zip (§5.5), and follow the Dockerfile contract (§5.6).

**Classic (URL first):**

1. Serve your app on localhost with `/health` and the lifecycle paths.
2. Expose HTTPS if the API cannot reach localhost (tunnel).
3. Register a **private** external app: name + base URL + manifest. Copy the one-time setup secret and restart your app with it as `ATRIUM_SETUP_SECRET`.
4. Connect — you must receive `lifecycle.setup` and persist secrets.
5. Confirm health, a test event or a real `tenancy.started`, logs in the Store, then disconnect.

---

## 11. Out of scope for this pack

- How we run ECS/Fargate or issue a COHO git repo
- Super Admin review tooling internals (you submit for approval after disclosures; SA approve is COHO-side)
- Partner payout operations beyond the share and remittance pointer in §6 Pricing and payments
- Injecting UI into existing COHO panels (not v1)

If you implement health, setup, disconnect, one trigger, Public API calls, logs, and (for almost all apps) `quickViewPath` plus `frame-ancestors`, you can get most of an app done.
