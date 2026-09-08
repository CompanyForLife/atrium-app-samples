# Public API Endpoints

Convenience inventory for public API v1.0 (deprecated) and v1.1 (current). Routes under `/v1/public/*` (legacy v1.0) and `/v1.1/public/*` (current). Zapier polling triggers are documented separately below.

**Authoritative shapes:** [Scalar COHO Public API 1.1](https://api.coho.life/scalar).

**Version lifecycle:** v1.0 is frozen and deprecated; use v1.1 for new integrations. See [public-api-lifecycle.md](public-api-lifecycle.md).

All endpoints below require the `public-api` authentication scheme (`Authorization: Bearer <api-key-guid>`), are rate-limited under the `public-api` policy, and return JSON. Every endpoint is scoped to the authenticated user's organisation.

## API key capability scopes (Phase 5)

Most `/v1.1/public/*` routes need only a valid API key (core T0-T2 surface). High-risk (T3) operations additionally require an opt-in capability on the key:

| Wire name | Flag | Typical use |
|---|---|---|
| `conversations` | Conversations | List / get / send / create conversations (all `/v1.1/public/conversations*` and `conversation-templates`) |
| `settlements` | Settlements | `GET/POST /v1.1/public/finance/settlements*` (list, party summary, save, owner unprocessed amounts) |
| `transactionMatching` | TransactionMatching | `GET /v1.1/public/transactions/overview`, `GET /v1.1/public/transactions/items` |
| `calendarDestructive` | CalendarDestructive | `DELETE /v1.1/public/calendar/items/{guid}` |
| `supplierArchive` | SupplierArchive | `PATCH /v1.1/public/suppliers/{guid}/archive` |

Missing capability returns **403**. Manage API: `POST/GET manage/organisation/{ref}/users/api-keys` and `PATCH .../api-keys/{guid}` with a `capabilities` string array. Null/empty capabilities = core only (existing keys keep current non-T3 access). POST returns `ApiKeyViewModel` (`name`, `key`, `capabilities`). Re-POSTing an existing key name with `capabilities` upserts those flags; omitting `capabilities` is legacy get-or-create and leaves flags unchanged.

## v1.0 (deprecated)

Operations below remain live but are deprecated. Stability is **Deprecated** (not Experimental). Prefer the v1.1 equivalents in Scalar **COHO Public API 1.1**.

## PublicApiAuthenticationController

**Route prefix:** `v1/public`  

### Authentication

| # | Method | Path | Summary | Stability |
|---|--------|------|---------|-----------|
| 1 | `GET` | `v1/public/test-auth` | Verify that your API key works | Deprecated |

## PublicApiPropertiesController

**Route prefix:** `v1/public`  

### Properties

| # | Method | Path | Summary | Stability |
|---|--------|------|---------|-----------|
| 2 | `GET` | `v1/public/properties` | List properties (filtered, paged, sorted) | Deprecated |
| 3 | `GET` | `v1/public/properties/{reference}` | Get a specific property | Deprecated |
| 4 | `GET` | `v1/public/buildings` | List buildings (filtered, paged, sorted) | Deprecated |

### Rooms

| # | Method | Path | Summary | Stability |
|---|--------|------|---------|-----------|
| 5 | `GET` | `v1/public/rooms` | List rooms (filtered, paged, sorted) | Deprecated |
| 6 | `GET` | `v1/public/rooms/{reference}` | Get a specific room | Deprecated |

### Property ownerships

| # | Method | Path | Summary | Stability |
|---|--------|------|---------|-----------|
| 11 | `GET` | `v1/public/property-ownerships` | List active property ownerships (for non-owned properties) | Deprecated |

## PublicApiTenantFindController

**Route prefix:** `v1/public`  

### Viewings

| # | Method | Path | Summary | Stability |
|---|--------|------|---------|-----------|
| 7 | `GET` | `v1/public/viewings/{reference}` | Get a specific viewing | Deprecated |
| 8 | `POST` | `v1/public/viewings/createviewing` | Create a viewing request from a potential tenant | Deprecated |

## PublicApiTenanciesController

**Route prefix:** `v1/public`  

### Tenancies

| # | Method | Path | Summary | Stability |
|---|--------|------|---------|-----------|
| 9 | `GET` | `v1/public/tenancies` | List tenancies (filtered, paged, sorted) | Deprecated |
| 10 | `GET` | `v1/public/tenancies/{reference}` | Get a specific tenancy | Deprecated |

## PublicApiRentCollectionController

**Route prefix:** `v1/public`  

### Rent Collection

| # | Method | Path | Summary | Stability |
|---|--------|------|---------|-----------|
| 12 | `GET` | `v1/public/rent-due-records` | List rent due records (filtered, paged, sorted) | Deprecated |
| 13 | `GET` | `v1/public/rent-due-records/{reference}` | Get a specific rent due record | Deprecated |

## PublicApiInfoBoxController

**Route prefix:** `v1/public`  

### Info Boxes

| # | Method | Path | Summary | Stability |
|---|--------|------|---------|-----------|
| 14 | `GET` | `v1/public/info-boxes/property/{propertyReference}` | List info boxes for a property | Deprecated |
| 15 | `GET` | `v1/public/info-boxes/{reference}` | Get a specific info box | Deprecated |
| 16 | `POST` | `v1/public/infobox` | Create an info box | Deprecated |
| 17 | `PATCH` | `v1/public/info-boxes/{reference}` | Update info box content | Deprecated |

---

## PublicApiMaintenanceController

**Route prefix:** `v1/public`  

### Maintenance

| # | Method | Path | Summary | Stability |
|---|--------|------|---------|-----------|
| 18 | `GET` | `v1/public/maintenance` | List maintenance issues (filtered, paged, sorted) | Deprecated |
| 19 | `GET` | `v1/public/maintenance/{reference}` | Get a specific maintenance issue | Deprecated |
| 20 | `POST` | `v1/public/maintenance` | Create a maintenance issue | Deprecated |
| 21 | `PATCH` | `v1/public/maintenance/{reference}` | Update manager notes or severity | Deprecated |
| 22 | `PATCH` | `v1/public/maintenance/{reference}/complete` | Mark a maintenance issue as completed | Deprecated |
| 23 | `POST` | `v1/public/maintenance/{reference}/files` | Upload a file to a maintenance issue | Deprecated |
| 24 | `GET` | `v1/public/maintenance/{reference}/history` | List maintenance issue history | Deprecated |
| 25 | `POST` | `v1/public/maintenance/{reference}/history` | Add a manual note to maintenance history | Deprecated |

---

## ZapierController

**Route prefix:** `v{version}/integrations/zapier`  

### Authentication

| # | Method | Path | Summary | API Version | Stability |
|---|--------|------|---------|-------------|-----------|
| 26 | `GET` | `v1.1/integrations/zapier/test-auth` | Verify that your API key works | v1.1 | Experimental |

### Triggers (v1.0 - Stable)

| # | Method | Path | Summary | API Version | Stability |
|---|--------|------|---------|-------------|-----------|
| 27 | `GET` | `v1/integrations/zapier/new-repair-trigger` | Poll for new maintenance issues | v1.0 | Stable |
| 28 | `GET` | `v1/integrations/zapier/new-lead-trigger` | Poll for new leads | v1.0 | Stable |
| 29 | `GET` | `v1/integrations/zapier/new-viewing-trigger` | Poll for new viewings | v1.0 | Stable |

### Triggers (v1.1 - Experimental)

| # | Method | Path | Summary | API Version | Stability |
|---|--------|------|---------|-------------|-----------|
| 30 | `GET` | `v1.1/integrations/zapier/new-maintenance-update-trigger` | Poll for maintenance history updates | v1.1 | Experimental |
| 31 | `GET` | `v1.1/integrations/zapier/new-viewing-update-trigger` | Poll for viewing history updates | v1.1 | Experimental |
| 32 | `GET` | `v1.1/integrations/zapier/new-onboarding-update-trigger` | Poll for onboarding history updates | v1.1 | Experimental |
| 33 | `GET` | `v1.1/integrations/zapier/new-general-update-trigger` | Poll for general history updates | v1.1 | Experimental |

---

## Summary

- **33 total endpoints** across 7 public API controllers plus Zapier
- **17 on split public API controllers** (authentication, properties, tenant find, tenancies, rent collection, info box; all v1.0, all Deprecated)
- **8 on PublicApiMaintenanceController** (maintenance CRUD and history, all v1.0, all Deprecated)
- **8 on ZapierController** (polling triggers for integrations, mix of v1.0 Stable and v1.1 Experimental)
- **Auth scheme:** `public-api` - GUID-based API key validated via `PublicApiAuthenticationHandler`
- **Rate limiting:** All endpoints use the `public-api` rate limiting policy
- **Organisation scoping:** All endpoints are scoped to the authenticated user's organisation
