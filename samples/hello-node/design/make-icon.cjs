#!/usr/bin/env node
// Makes an app icon for the Store listing: a flat square with one COHO icon, or a picture of your own,
// centred on it. The Store rounds the corners itself and shows the icon at 44 to 56 px, so the result is
// two flat colours and one shape. This is the fallback when an image model is unavailable or keeps
// failing the check (design.md, section 20.1).
//
//   node docs/design/atrium/tools/make-icon.js --background '#CEE2FF' --glyph icon-house [--colour '#262626'] [--out store/icon.png]
//   node docs/design/atrium/tools/make-icon.js --background '#293B5B' --mark my-mark.png [--out store/icon.png]
//   In a seed copied from hello-node:  npm run make:icon -- --background '#CEE2FF' --glyph icon-house
//   (Quote #hex, or pass bare CEE2FF — an unquoted # is a shell comment.)
//
// --background  the canvas colour, a hex value from the table in design.md section 20.1.
// --glyph       an icon id from design.md section 16.1. Read from icons.svg next to this script (the seed's
//               design folder), else from assets/svg in the HouseShare repo.
// --colour      the symbol colour. Defaults to dark text on a light background and white on a dark one.
// --mark        a PNG, JPG or WebP cut-out of your own symbol (transparent or plain removable background),
//               placed instead of a glyph. A full opaque square with the wrong background is pasted as-is;
//               use --glyph or regenerate the mark as a cut-out instead.
// --size        canvas size in px, default 1024.   --scale  symbol width as a fraction of the canvas, default 0.6.
//
// Needs playwright (npm i playwright, then npx playwright install chromium). Run check-icon on the result.
'use strict';
const fs = require('fs');
const path = require('path');

const usage = "Usage: node make-icon.js --background '#hex' (--glyph icon-id [--colour '#hex'] | --mark picture.png) [--out store/icon.png] [--size 1024] [--scale 0.6]";

const args = process.argv.slice(2);
// The last occurrence wins, so a seed's npm script can set --out and the caller can still override it.
const flag = (name, fallback) => {
  let value = fallback;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}`) {
      value = args[i + 1];
      args.splice(i, 2);
      i--;
    }
  }
  return value;
};

const background = flag('background', null);
const glyph = flag('glyph', null);
const colourArg = flag('colour', null);
const mark = flag('mark', null);
const out = path.resolve(flag('out', 'store/icon.png'));
const size = Number(flag('size', 1024));
const scale = Number(flag('scale', 0.6));

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

function hex(value, name) {
  const match = /^#?([0-9a-f]{6})$/i.exec((value || '').trim());
  if (!match) fail(`--${name} must be a six-digit hex colour such as #CEE2FF (got ${JSON.stringify(value)}).\n${usage}`);
  return `#${match[1].toUpperCase()}`;
}

// Relative luminance of an sRGB colour, 0 for black and 1 for white.
function luminance(hexColour) {
  const channel = (i) => {
    const c = parseInt(hexColour.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

if (!background) fail(`--background is required.\n${usage}`);
if (!glyph && !mark) fail(`Give either --glyph <icon-id> or --mark <picture>.\n${usage}`);
if (glyph && mark) fail(`Give --glyph or --mark, not both.\n${usage}`);
if (!Number.isInteger(size) || size < 512) fail('--size must be a whole number of at least 512: the Store needs at least 512 x 512.');
if (!(scale > 0 && scale <= 1)) fail('--scale must be between 0 and 1.');

const canvas = hex(background, 'background');
const colour = colourArg ? hex(colourArg, 'colour') : (luminance(canvas) > 0.5 ? '#262626' : '#FFFFFF');
const symbolPx = Math.round(size * scale);

// Find the glyph: the seed's sprite next to this script, else the icon source in the repo.
function readGlyph(id) {
  const name = id.startsWith('icon-') ? id : `icon-${id}`;
  const sprite = path.join(__dirname, 'icons.svg');
  if (fs.existsSync(sprite)) {
    const match = new RegExp(`<symbol id="${name}" viewBox="([^"]+)">([\\s\\S]*?)</symbol>`).exec(fs.readFileSync(sprite, 'utf8'));
    if (match) return { viewBox: match[1], inner: match[2].trim(), source: path.relative(process.cwd(), sprite) };
  }
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const file = path.join(repoRoot, 'assets', 'svg', `${name}.svg`);
  if (fs.existsSync(file)) {
    const svg = fs.readFileSync(file, 'utf8');
    const viewBox = /viewBox\s*=\s*"([^"]+)"/i.exec(svg);
    const inner = /<svg\b[^>]*>([\s\S]*)<\/svg>/i.exec(svg);
    if (viewBox && inner) return { viewBox: viewBox[1], inner: inner[1].trim(), source: path.relative(process.cwd(), file) };
  }
  fail(`No icon called ${name}. Ids are the file names in assets/svg without .svg (design.md, section 16.1). Looked in ${sprite} and ${file}.`);
}

function readMark(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) fail(`No file at ${resolved}.`);
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(resolved).toLowerCase()];
  if (!mime) fail('--mark must be a PNG, JPG or WebP file.');
  return { dataUri: `data:${mime};base64,${fs.readFileSync(resolved).toString('base64')}`, source: path.relative(process.cwd(), resolved) };
}

const symbol = glyph ? readGlyph(glyph) : readMark(mark);
const body = glyph
  ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.viewBox}" fill="${colour}" aria-hidden="true">${symbol.inner}</svg>`
  : `<img src="${symbol.dataUri}" alt="">`;

// A page of its own, not an app screen, so it carries its own styles: the Store sees only the picture.
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; padding: 0; width: ${size}px; height: ${size}px; overflow: hidden; }
body { background: ${canvas}; display: flex; align-items: center; justify-content: center; }
svg, img { width: ${symbolPx}px; height: ${symbolPx}px; display: block; }
img { object-fit: contain; }
</style></head><body>${body}</body></html>`;

let playwright;
try {
  playwright = require('playwright');
} catch (e) {
  fail('playwright is not installed. Run: npm i playwright && npx playwright install chromium', 1);
}

(async () => {
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, type: 'png' });
  } finally {
    await browser.close();
  }
  const rel = path.relative(process.cwd(), out);
  const inSeed = fs.existsSync(path.join(__dirname, 'check-icon.cjs'));
  console.log(`Saved ${rel} (${size} x ${size}): ${glyph ? `${glyph} in ${colour}` : symbol.source} on ${canvas}.`);
  console.log(`Now run: ${inSeed ? 'npm run check:icon' : `node docs/design/atrium/tools/check-icon.js ${rel}`}`);
  console.log(`Record the command in ${path.join(path.dirname(rel), 'icon-brief.md')} so a person can make the same icon again.`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
