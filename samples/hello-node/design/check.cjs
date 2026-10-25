#!/usr/bin/env node
// Checks app pages, or the examples inside design.md, against the COHO Atrium design rules.
// Includes the theme rules: the theme comes from COHO through the theme script (design.md section 1), never hard-coded
// in markup and never read from the OS. And the reorder rules: a list the user puts in order is reordered by the kit's
// reorder script (design.md section 11), pasted unchanged or linked, never by a sortable library, native draggable or
// drag code of the page's own. It reads a page as authored, before any script runs: a rendered page carries what
// reorder.js adds (its cdk- classes, the handles' tabindex and style locks) and fails.
//
//   node docs/design/atrium/tools/check.js my-app.html [more.html ...]
//   node docs/design/atrium/tools/check.js docs/design/atrium/design.md    (checks every ```html example in the guide)
//
// Needs nothing but Node. Exits 1 if any rule is broken.
'use strict';
const fs = require('fs');
const path = require('path');

const kitDir = path.resolve(__dirname, '..');
// coho.css sits beside this script in a seed's design folder, or one level up in docs/design/atrium.
const cssPath = [path.join(__dirname, 'coho.css'), path.join(kitDir, 'coho.css')].find(p => fs.existsSync(p));
const css = fs.readFileSync(cssPath, 'utf8');
const known = new Set((css.match(/\.-?[_a-zA-Z][\w-]*/g) || []).map(c => c.slice(1)));
const normalise = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
const kitCss = normalise(css);
// reorder.js sits beside coho.css. A pasted copy is recognised by its first line and must match it after normalising.
const reorderPath = [path.join(__dirname, 'reorder.js'), path.join(kitDir, 'reorder.js')].find(p => fs.existsSync(p));
const REORDER_MARK = 'COHO reorder script for Atrium apps';
const kitReorder = reorderPath ? normalise(fs.readFileSync(reorderPath, 'utf8')) : '';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/check.js page.html [page2.html ...]   or   node tools/check.js design.md');
  process.exit(2);
}
let problems = 0;
const fail = (name, message) => { problems++; console.log(`${name}: ${message}`); };

function check(name, html, isPage) {
  let body = html.replace(/<!--[\s\S]*?-->/g, '');

  if (isPage) {
    const styles = [...body.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
    if (!styles.length && !/<link[^>]+href="[^"]*coho\.css"/.test(body)) fail(name, 'no COHO stylesheet: paste coho.css into a <style> block, or link it');
    for (const s of styles) if (normalise(s[1]) !== kitCss) fail(name, '<style> block is not the unchanged coho.css (write no CSS of your own)');
    body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  }

  // Reorder: a page with a reorderable list carries reorder.js, linked by its name or pasted unchanged in its own block.
  let hasReorder = /<script\b[^>]+src="[^"]*reorder\.js"/.test(body);
  let changedReorder = false;
  for (const s of [...body.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]) {
    if (!s[1].includes(REORDER_MARK)) continue;
    if (normalise(s[1]) === kitReorder) hasReorder = true;
    else { changedReorder = true; fail(name, 'pasted reorder script is not the unchanged reorder.js (paste it into its own <script> block unchanged, or link it)'); }
    body = body.replace(s[0], '');
  }
  if (isPage && /\bcard__detail--step-list\b/.test(body) && !hasReorder && !changedReorder) fail(name, 'has a card__detail--step-list but no reorder script (paste reorder.js into its own <script> block, or link it; design.md section 11, Reorderable list)');
  if (/<(script|link)\b[^>]+(sortable|dragula|interact\.js|interactjs|draggable|dnd-kit|jquery-ui)/i.test(body)) fail(name, "a drag or sortable library is linked (lists are reordered by the kit's reorder script; design.md section 11, Reorderable list)");
  if (/draggable="true"/i.test(body)) fail(name, 'draggable="true" in markup (rows are reordered by the kit\'s reorder script through their handles; design.md section 11, Reorderable list)');
  if (/class="[^"]*\bcdk-/.test(body)) fail(name, 'cdk-* class written into markup (the reorder script adds its own when it wires the list and while a row is dragged, so check the page as authored, not a rendered copy; design.md section 11, Reorderable list)');

  const unknown = new Set();
  for (const m of body.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/).filter(Boolean)) if (!known.has(c)) unknown.add(c);
  for (const c of unknown) fail(name, `class "${c}" is not in coho.css (use only classes design.md documents)`);

  if (/\sstyle\s*=/.test(body)) fail(name, 'inline style attribute (use the utility classes)');
  if (/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/.test(body.replace(/href="#[^"]*"/g, ''))) fail(name, 'hard-coded hex colour (colour comes from the parts and the tokens)');
  if (/<(script|link)\b[^>]+(bootstrap|tailwind|fontawesome|font-awesome|material|heroicons|lucide|primeicons|bootstrap-icons)/i.test(body)) fail(name, 'another UI or icon library is linked');

  // Theme: COHO decides it and the theme script applies it. Never hard-coded, never read from the OS, never missing.
  if (/class="[^"]*\bcoho__dark\b[^"]*"/.test(body)) fail(name, 'coho__dark hard-coded in markup (the theme script sets it from COHO; design.md section 1)');
  if (/data-theme="dark"/.test(body)) fail(name, 'data-theme="dark" hard-coded in markup (the theme script sets it from COHO; design.md section 1)');
  if (/prefers-color-scheme|matchMedia\s*\(/.test(body)) fail(name, 'reads the OS colour scheme (the theme comes from COHO, never from prefers-color-scheme)');
  if (isPage && !/classList\.toggle\(\s*['"]coho__dark['"]/.test(body)) fail(name, "does not apply COHO's theme (paste the theme script from design.md section 1)");

  // Buttons: one primary per view, every button inside a button__group-item.
  const buttonTags = [...body.matchAll(/<(button|a)\b[^>]*class="([^"]*\bbutton\b[^"]*)"[^>]*>/g)];
  const primaries = buttonTags.filter(m => !m[2].split(/\s+/).some(x => /^button--(secondary|ghost|cancel|payment|feedback|knowledge|advert)$/.test(x)));
  if (primaries.length > 1) fail(name, `${primaries.length} primary buttons (one per view)`);
  for (const m of buttonTags) {
    const before = body.slice(0, m.index).replace(/\s+$/, '');
    if (!/<div class="button__group-item">$/.test(before)) fail(name, `button not wrapped in button__group-item: ${m[0].slice(0, 70)}`);
  }

  for (const m of body.matchAll(/<table\b[^>]*>/g)) {
    if (!/\bcompact__table\b/.test(m[0]) || !/\bcompact__table--narrow\b/.test(m[0])) fail(name, 'every table needs compact__table and compact__table--narrow');
  }

  // Every control has a label: a <label for>, its own wrapping label (radio, checkbox), or an aria-label.
  const labelled = new Set([...body.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map(m => m[1]));
  for (const m of body.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = m[2];
    if (/type="(hidden|submit|button)"/.test(attrs)) continue;
    const id = (attrs.match(/\sid="([^"]+)"/) || [])[1];
    const wrapped = /type="(radio|checkbox)"/.test(attrs);
    if (!wrapped && !(id && labelled.has(id)) && !/aria-label=/.test(attrs)) fail(name, `<${m[1]}${id ? ' id="' + id + '"' : ''}> has no label`);
  }

  // Icons: COHO's set only, via <use>, with the inner svg's class naming the same icon as the href.
  for (const m of body.matchAll(/<svg\b([^>]*)>\s*<use\b[^>]*href="#([^"]+)"/g)) {
    const classes = ((m[1].match(/class="([^"]*)"/) || ['', ''])[1]).split(/\s+/);
    const named = classes.find(c => /^icon-[a-z0-9]+(-[a-z0-9]+)*$/.test(c)); // single hyphens: icon--colour is a modifier, not a name
    if (!named) fail(name, `<svg> using #${m[2]} has no icon-<name> class, so it has no size`);
    else if (named !== m[2]) fail(name, `<svg class="${named}"> uses #${m[2]}: the class and the href must name the same icon`);
  }
  if (/<svg\b(?![^>]*\bhidden\b)[^>]*>\s*<(path|circle|rect|g)\b/i.test(body)) fail(name, 'hand-authored svg shapes: icons come from COHO\'s set through <use>');
  if (/<i\b[^>]*class="[^"]*\b(fa|fas|far|fab|material-icons|bi|pi)\b/.test(body)) fail(name, 'icon-font markup from another library');
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (/\.md$/i.test(file)) {
    let n = 0;
    for (const m of text.matchAll(/```html\r?\n([\s\S]*?)```/g)) { n++; check(`${path.basename(file)} example ${n}`, m[1], false); }
    if (!n) fail(file, 'no ```html blocks found');
  } else {
    check(file, text, /<html/i.test(text));
  }
}
console.log(problems ? `\n${problems} problem(s).` : 'All checks passed.');
process.exit(problems ? 1 : 0);
