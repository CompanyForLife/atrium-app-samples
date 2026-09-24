# Atrium dev docs site

The Angular site that renders `docs/atrium-app-developer-spec.md` (one level up in this repo) into the developer docs at [the deployed GitHub Pages site](https://companyforlife.github.io/atrium-app-samples/). This README is for anyone maintaining the site itself - if you're looking for the actual Atrium developer docs, read the deployed site or the spec doc directly.

## How content gets in

Nothing here is hand-written. `scripts/generate-spec-content.mjs` reads `../docs/atrium-app-developer-spec.md`, splits it on `## N. Title` headings, and writes `src/app/content/spec-content.generated.json` (gitignored, regenerated on every `npm start` / `npm run build` via the `prebuild`/`prestart` npm scripts). To change what the docs pages say, edit the spec doc - never the generated JSON, and never hand-type content into a component.

Sample page content (`src/app/content/samples.ts`) is the one exception - it's hand-maintained to match each sample's real README under `../samples/`, since those aren't structured the same way as the spec doc.

## Design system

`assets/scss/` at the repo root is a vendored snapshot of the specific HouseShare design system files this site needs (colour tokens, grid, mixins, icon fill classes, base reset) - traced to a minimal, self-contained set with no other dependencies. This is a frozen copy, not a live link: if HouseShare's design system changes, this site won't pick it up automatically. If a visual mismatch shows up later, that's most likely why - re-copy the relevant file(s) from HouseShare's `assets/scss/` by hand.

The icon sprite (`public/assets/images/svg/svg-symbols.svg`) is vendored the same way, for the same reason.

## Local development

```bash
npm install
npm start
```

Serves at `http://localhost:4300` (see `angular.json`) with live reload. `npm run build` produces a fully prerendered static site (every doc section and sample page is baked to real HTML at build time - no server needed) in `dist/atrium-docs/browser`.

## Deployment

`.github/workflows/deploy-docs.yml` builds and publishes `dist/atrium-docs/browser` to GitHub Pages on every push to `main` that touches `atrium-docs/` or the spec doc. It can also be run manually from the Actions tab. GitHub Pages itself needs "Source: GitHub Actions" set in the repo's Settings > Pages (already done as of this site's initial deploy).
