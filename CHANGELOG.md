# Changelog

## 2026-09-30 — per-app setup secret

- COHO mints a setup secret per app at registration and shows it once. Self-hosted and draft apps copy it into `ATRIUM_SETUP_SECRET` before connect. Atrium Hosting injects it.
- Lost or leaked secrets are regenerated from My apps or the publisher portal. The old value stops immediately.
- Republish developer spec and hello sample READMEs

## 2026-09-30 — setup bootstrap secret wording

- Clarify that `ATRIUM_SETUP_SECRET` is COHO platform config: Hosting injects it; builders do not create, rotate, or request the value
- Republish developer spec + hello sample READMEs from HouseShare SoT

## 2026-09-23 — runtime contract snapshot

- Fuller `triggers.schedules` field notes (`key`, `cron`, `timezone`, `path`)
- Event `data` shapes for `tenancy.started`, `tenancy.ended`, and `schedule.<key>`
- `rentPayments` listed with other high-risk Public API capabilities
- Spec §5.4: create / update / list org-owned and publisher Atrium apps via MCP (zip + GitHub hosted flow, confirm gate, connect-after-ready)


## 2026-09-08 — hello sample parity

- All four languages share quick view, external configure, persistence, and capability probes
- Matching manifests and starter tests

## 2026-09-08 — initial public snapshot

- App developer spec (`manifestVersion` 1)
- Hello samples: Node, Python, Go, .NET
- Public API v1.1 convenience docs + lifecycle note
