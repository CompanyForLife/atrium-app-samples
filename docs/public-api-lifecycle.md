# Public API version lifecycle

How COHO communicates public API version status to integrators. Applies to `/v1.0/public/*` (legacy), `/v1/public/*` (same legacy surface), and `/v1.1/public/*` (current).

Related: [public-api-endpoints.md](public-api-endpoints.md). Interactive reference: Scalar at `/scalar` on the API host (defaults to **COHO Public API 1.1**).

---

## Version roles

| Version | URL prefix | Status | Integrator action |
|---|---|---|---|
| **1.0** | `/v1.0/public/*` or `/v1/public/*` | **Deprecated / frozen** | Migrate to v1.1 before **6 October 2026** (sunset) |
| **1.1** | `/v1.1/public/*` | **Current** | Use for all new work; OpenAPI doc is authoritative |

v1.0 has **sunset date 6 October 2026 (UTC)**. After sunset, v1.0 routes return 404. The sunset date appears in the v1.0 OpenAPI description and the `Sunset` response header (RFC 8594).

---

## Where lifecycle is communicated

### OpenAPI / Scalar

- Separate documents: `public-1.0` and `public-1.1` (`/openapi/public-1.0.json`, `/openapi/public-1.1.json`).
- Document-level `info.description` states legacy vs current.
- All v1.0 operations are marked `deprecated: true` in OpenAPI.
- Scalar defaults to the v1.1 document.

### HTTP response headers (v1.0 only)

On successful and error responses for legacy public API requests:

| Header | Value | Meaning |
|---|---|---|
| `Deprecation` | `true` | This API version is deprecated |
| `Sunset` | HTTP-date (RFC 8594) | When v1.0 stops being available (`Sun, 06 Oct 2026 23:59:59 GMT`) |
| `Link` | `<successor-path>; rel="successor-version"` | Equivalent v1.1 path (same resource suffix) |

### Stability labels (Scalar)

| Surface | Stability | Meaning |
|---|---|---|
| v1.0 | `Deprecated` | Legacy; frozen except hotfixes |
| v1.1 | `Stable` (default) | Current production integrator API |

Individual operations may override stability (for example `Experimental` for a beta endpoint).

---

## Future: sunset and removal

When v1.0 retirement is scheduled:

1. ~~Set sunset date and announce to integrators.~~ **Done:** 6 October 2026 (UTC).
2. ~~Add `Sunset` header (IMF-fixdate per RFC 8594).~~ **Done.**
3. After sunset, block v1.0 (404 for unpublished versions).
4. Remove v1.0 routes and OpenAPI document in a dedicated change.

