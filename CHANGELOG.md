# Changelog

## 2026-10-24 — web app default; agent sample as exception

- Developer spec §2 / §6: default sample manifest and surface guidance is web app + `quickViewPath`; agent/config-only is a rare exception
- Add `samples/hello-agent-node` — explicit no-UI agent starter with README wording that it is the exception
- Root README and §9 kit table list the four language hellos as web apps and point agent builders at `hello-agent-node` only

## 2026-10-20 — usage-token remint while quick view stays open

- Developer spec §6 / §8: keep interactive sessions alive past the ~15m JWT — COHO remints via postMessage (`atrium.usageToken.refresh` / `atrium.usageToken` / error); apps must swap the Bearer (cannot mint)
- Host also remints about every 12 minutes and on tab visibility
- Node kit helpers `createUsageTokenSession` / `setBearer` (in HouseShare `kits/atrium-node`; not copied into this pack)
- Republish developer spec from HouseShare SoT

## 2026-10-20 — quick-view theme bridge

- Developer spec §6: signed launch query `theme=light|dark` (opener `User.DarkMode`) plus host→app `atrium.quickView.theme` postMessage (load / ready / mid-session toggle)
- Hello samples apply theme from the query and live bridge messages
- Republish developer spec and hello samples from HouseShare SoT

## 2026-10-02 — Atrium Hosting Dockerfile UID contract

- Developer spec §5.6: hosted images must run as UID/GID `65532` (EFS `/data` access point). Documents aspnet default UID `1654` failure mode.
- hello-dotnet README points authors at §5.6 when adding a Hosting Dockerfile.
- Republish developer spec and hello samples from HouseShare SoT

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
