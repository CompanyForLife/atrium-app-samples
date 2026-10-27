// Captures a Store screenshot of a running app, for the Store listing.
// The first screenshot on a listing is the picture on the app's Store card, so capture the
// screen that best shows what the app does.
// Usage: node tools/capture-screenshot.js <url or html file> [out.png] [--wait <css selector>] [--width 1440] [--height 900]
// Needs playwright on NODE_PATH (npm i playwright, then npx playwright install chromium).
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};

const waitFor = flag('wait', null);
const width = Number(flag('width', 1440));
const height = Number(flag('height', 900));
const [target, outArg] = args;

if (!target) {
  console.error('Usage: node tools/capture-screenshot.js <url or html file> [out.png] [--wait <css selector>] [--width 1440] [--height 900]');
  process.exit(1);
}

const url = /^https?:\/\//.test(target) ? target : pathToFileURL(path.resolve(target)).href;
const out = path.resolve(outArg || 'store/screenshot.png');

let playwright;
try {
  playwright = require('playwright');
} catch (e) {
  console.error('playwright is not installed. Run: npm i playwright && npx playwright install chromium');
  process.exit(1);
}

(async () => {
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: 'networkidle' });
    if (waitFor) await page.waitForSelector(waitFor);

    // A sign-in page or an error page makes a poor Store picture — refuse to save it.
    const text = (await page.evaluate(() => document.body.innerText || '')).trim();
    if (text.length < 40) {
      console.warn('Warning: the page has almost no visible text. Is it showing the app, not a sign-in or error page?');
    }
    if (/\b(sign in|log in|login|not found|404|unauthori[sz]ed)\b/i.test(text.slice(0, 400))) {
      console.error('The page looks like a sign-in or error screen (often an unsigned /ui launch). Capture a signed launch URL that shows the app itself.');
      process.exit(1);
    }

    // The viewport only, not the full page: the Store card shows the top of the image.
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    console.log(`Saved ${out} (${width} x ${height}, 2x).`);
    console.log('Before you attach it: keep the key content in the top two thirds. The bottom third fades to a dark colour behind the app name on the Store card.');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
