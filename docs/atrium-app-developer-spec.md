# COHO Atrium — app developer spec

What you need to build an Atrium app that COHO can connect, trigger, and display.

This is the pack to send an app developer (or their AI). It is the external contract for the Atrium runtime: manifest, signed deliveries, health, Public API usage, Store logs, light config, and optional quick view.

Before a **public** catalogue listing, COHO will ask you to pass a quality-gate checklist (shared separately at listing time). Private org apps only need this runtime contract.

**Not in this spec:** Atrium Hosting (how COHO runs your image), COHO CLI, listing review UI, billing, or how COHO staffs its own seed apps.

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
    "mode": "native",
    "browserBaseUrl": null,
    "externalConfigureUrl": null,
    "schemaPath": "/config/schema",
    "getPath": "/config",
    "putPath": "/config",
    "quickViewPath": null
  },
  "requestedCapabilities": ["conversations"],
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

| Field | Meaning |
|---|---|
| `health.path` | Unsigned `GET`. See §4. |
| `triggers.lifecycle.setupPath` | Signed `POST` on connect. **Must return 2xx** or connect rolls back. |
| `triggers.lifecycle.disconnectPath` | Signed `POST` after credentials are revoked (best-effort). Delete org-scoped data. |
| `triggers.schedules` | Opt-in. Empty = COHO will not tick you on a cron. |
| `triggers.events` | Opt-in. Unknown keys are ignored until COHO supports them. |
| `requestedCapabilities` | Public API capability names you intend to use (honesty in the Store). See §8. |
| `config.schemaPath` / `getPath` / `putPath` | App-owned light config. Store proxies signed GET/PUT. Omit or unused if you have no prefs. |
| `config.browserBaseUrl` | Public HTTPS origin for hosted app UI. Runtime webhooks and config remain on the private registered base URL. |
| `config.externalConfigureUrl` | Optional new-tab configure path on the browser base URL. |
| `config.quickViewPath` | Optional in-COHO iframe. **Omit for agent apps** (webhooks + API only). See §6. |

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
- HMAC-SHA256 with the connection **signing secret** from setup, except `lifecycle.setup`, which uses the out-of-band bootstrap secret described below (never the Public API bearer token).
- Reject timestamps more than **30 seconds in the future**. Reject timestamps more than **300 seconds in the past**.

Three details cause most verification bugs:

- Sign the **raw request body bytes** exactly as received. Do not parse and re-serialise JSON first — key order and whitespace change, and every signature then fails.
- An **empty body is valid and still signed**. Signed `GET`s (config schema, config values, quick view) still include method, path, and connection in the signed string.
- Compare digests in **constant time** (`timingSafeEqual`, `hmac.compare_digest`, `hmac.Equal`, `CryptographicOperations.FixedTimeEquals`). A `==` string compare leaks timing.

#### 3.1.1 Signature test vectors

Assert against these before you trust your implementation. Secret `atrium_test_secret`, timestamp `1767225600`, connection `11111111-1111-1111-1111-111111111111`, so the header is `t=1767225600,v1=<expected>`. For the setup row, treat this as the bootstrap secret; for later rows, treat it as the connection signing secret.

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
| Timeout, `408`, `429`, `5xx` | Retry with backoff, then dead-letter |
| `401` / `403` / `400` | No retry |
| `404` on **setup** | Connect fails and rolls back |

Health is **app-scoped** (one probe per app base URL). After the first not-OK result the app is
degraded; after three consecutive not-OK results COHO pauses schedule/event triggers for **all**
connections of that app. Any OK result immediately clears the failure count and resumes delivery.
Disconnect may still be attempted while paused.

### 3.2 `lifecycle.setup` — app connected

Before COHO connects an app, its deployment must hold the out-of-band setup bootstrap secret as `ATRIUM_SETUP_SECRET`. COHO signs `lifecycle.setup` with that bootstrap secret. Verify it **before** accepting or storing anything from the request. Never authenticate setup with `data.signingSecret`: that value is untrusted until bootstrap verification succeeds.

The bootstrap secret is only for setup. After successful setup, verify config, quick-view, lifecycle, schedule, and event requests with the per-connection `data.signingSecret`.

`data`:

```json
{
  "apiKey": "<guid>",
  "apiBaseUrl": "https://api.example.com",
  "signingSecret": "<hex>"
}
```

- `apiKey` — `Authorization: Bearer <apiKey>` on Public API v1.1 and Store log/config calls. Shown once.
- `apiBaseUrl` — no trailing slash. Call `{apiBaseUrl}/v1.1/public/…`.
- `signingSecret` — verify all later signed POSTs (and signed config GET/PUT).

Store these against `connectionReference`. If you return non-2xx, COHO deletes the connection and the key.

### 3.3 `lifecycle.disconnect` — app removed

Credentials are already dead. `data` may include a reason. Delete org-scoped data you hold for that connection.

### 3.4 Schedules and events

`type` is `schedule.<key>` or `event.<key>`. Domain payloads in `data` use **references / Guids only**, never database integer ids.

First published event keys:

| Key | When |
|---|---|
| `tenancy.started` | Tenancy becomes active (e.g. FUTURE to ACTIVE) |
| `tenancy.ended` | Tenancy becomes past (e.g. ACTIVE to PAST) |
| `atrium.test` | Manager hits **Run test** in the Store (not a domain event) |

The catalogue will grow. Ignore unknown keys.

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
- Use Guids / references from the API — never database integer ids

### 5.2 Store logs

`POST {apiBaseUrl}/v1.1/public/atrium/logs`

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

Use this for small preference sets (subject line, send time). Serious UI belongs in quick view or an external URL.

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

---

## 6. How the app appears in COHO

Three surfaces. Combine them if you need to. **Not every app needs a UI.**

### Agent (no UI)

Omit `quickViewPath`. Birthday-style: webhooks + Public API + optional native prefs. The Store will not offer **Open quick view**.

### Light config in the Store

JSON Schema form, proxied to you (§5.3).

### Quick view (iframe)

Set `config.quickViewPath`. Self-hosted apps resolve it against the registered
base URL. Hosted apps with browser UI set `config.browserBaseUrl`, and COHO
resolves quick view and external config paths against that public HTTPS origin
while runtime calls stay private. Absolute URLs are allowed only on the selected
browser origin. COHO loads the page in an iframe after minting a short-lived
signed launch URL (`GET`, empty body, `connectionReference` +
`atriumSignature` query). Verify that signature the same way as other signed
GETs.

You must:

- Send `Content-Security-Policy: frame-ancestors` listing COHO origins (do not use `*`).
- Treat the page as **third-party chrome** — no requirement to match COHO CSS.
- Never put the API key or signing secret in the query string. The launch signature is not a substitute for checking method, path, and connection.

Thin `postMessage` bridge (parent is COHO):

| Message `type` | Direction | Role |
|---|---|---|
| `atrium.quickView.close` | app → COHO | Close the shell |

Resize, open-full-app, and toast are reserved on the same bridge; do not invent parallel channels.

### External URL

`externalConfigureUrl` opens in a **new tab** through the same short-lived signed
launch flow as quick view. Verify the `GET` signature before showing
connection-specific UI. Full user SSO remains a later extension.

---

## 7. Rate limits

| Surface | Limit (today) | Partition |
|---|---|---|
| Public API (`public-api` policy) | 100 requests / minute | Client IP |
| MCP (`X-Coho-Api-Client` only) | 100 requests / minute | User id, else IP |
| COHO → your app | Retries on `429`; then dead-letter | Per delivery |

There is **no per-connection Atrium quota** yet. Do not assume a private bucket. HTTP `429` from Public API should be retried with backoff, same as COHO retries `429` from you.

WAF/IP blocks on the public API hostname still apply. Auth endpoints and Find-a-Home enquiry limits are unrelated to Store apps.

---

## 8. Permissions (high level)

At connect, COHO mints a **normal Public API key** for this connection (interim). It is revoked on disconnect. It is **not** a fake manager user (`ATRIUM_USER` is not the model).

- Declare `requestedCapabilities` for what you actually call.
- High-risk (T3) Public API areas already need extra flags on the key, for example `conversations`, `settlements`, `transactionMatching`, `calendarDestructive`, `supplierArchive`. Missing flag → HTTP 403.
- The Store shows requested, granted, pending, and unsupported capabilities.
- A manifest update never expands an existing key automatically. Existing grants keep working and
  newly requested T3 calls return `403` until an unrestricted manager reviews and approves the exact
  additive delta in Store.
- Approval updates the existing key in place, is audited, and takes effect on the next API request.
  It does not rotate credentials or rerun `lifecycle.setup`. Disconnect/connect remains the
  credential-rotation path.
- Capability removal is not automatic. A future explicit downgrade/revoke flow owns that case.

You cannot outrun the connecting manager's organisation permissions. If they cannot send a tenant message, neither can a key minted for their org in that area once real scopes land.

---

## 9. Starter samples

There is **no Atrium SDK, and no published package in any language**. This spec plus the signature test vectors (§3.1.1) are the contract. Any language that can serve HTTPS is allowed.

We ship four equal hello-world samples. Each is self-contained — copy one, adapt it, delete what you do not need:

| Sample | Language |
|---|---|
| `samples/hello-node` | Node 20+ |
| `samples/hello-dotnet` | .NET minimal API |
| `samples/hello-python` | Python 3, standard library only |
| `samples/hello-go` | Go, standard library only |

All four implement the same surface: health, signed lifecycle webhooks, a signed trigger, and the native config routes with a schema from §5.3.1. `hello-node` and `hello-go` also demonstrate a quick view.

We deliberately do not ship a dependency for this. The runtime contract is roughly 300 lines in any language, most of which is HTTP routing you already have in your own stack, and a library that owns your server is useless if you are adding Atrium to an existing app. Verifying signatures is the one part where a subtle mistake is a security hole rather than a bug, which is why it has published test vectors instead of a package.

Start from a hello sample. Richer demo apps (schedules, persistence, real Public API calls) may exist for COHO dogfooding; they are not part of the supported external starter set.

Samples target **self-host**. Atrium Hosting (COHO runs your image) is documented separately when you need it.

---

## 10. Local loop (until Hosting exists)

1. Serve your app on localhost with `/health` and the lifecycle paths.
2. Expose HTTPS if the API cannot reach localhost (tunnel).
3. Register a **private** app in a feature-flagged Store org: name + base URL + manifest.
4. Connect — you must receive `lifecycle.setup` and persist secrets.
5. Confirm health, a test event or a real `tenancy.started`, logs in the Store, then disconnect.

---

## 11. Out of scope for this pack

- How we run ECS/Fargate or issue a COHO git repo
- Public listing pipeline (draft → review → listed) beyond "you will be asked to pass a quality-gate checklist"
- Paid apps / Stripe
- Injecting UI into existing COHO panels (not v1)

If you implement health, setup, disconnect, one trigger, Public API calls, logs, and (if you want a UI) `quickViewPath` plus `frame-ancestors`, you can get most of an app done.
