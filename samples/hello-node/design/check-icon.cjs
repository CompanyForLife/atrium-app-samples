#!/usr/bin/env node
// Checks an app icon for "obvious corners": a rounded icon sitting on a square background, or with
// transparent corners. The Store rounds icons itself, so the icon should fill the whole square.
//
//   node docs/design/atrium/tools/check-icon.js icon.png
//
// PNG only (8-bit, not interlaced), which is what the developer spec asks for. Needs only Node.
// Exit code 1 when there is something to fix, so it can sit in a build step.
'use strict';
const fs = require('fs');
const zlib = require('zlib');

const MIN_SIZE = 512;
const MAX_BYTES = 2000000;
const CORNER_COLOUR_DISTANCE = 70; // RGB distance between a corner and the colour just inside it
const CORNER_MIN_ALPHA = 200;      // a corner this transparent shows the colour behind the icon

function readPng(buffer) {
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG file');
  let pos = 8;
  let ihdr = null;
  let palette = null;
  let transparency = null;
  const idat = [];
  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const body = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') ihdr = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colour: body[9], interlace: body[12] };
    else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + length;
  }
  if (!ihdr) throw new Error('missing IHDR');
  if (ihdr.depth !== 8) throw new Error(`only 8-bit PNGs are supported (this one is ${ihdr.depth}-bit)`);
  if (ihdr.interlace) throw new Error('interlaced PNGs are not supported; save it without interlacing');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.colour];
  if (!channels) throw new Error(`unsupported colour type ${ihdr.colour}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = ihdr.width * channels;
  const rows = Buffer.alloc(ihdr.height * stride);
  for (let y = 0; y < ihdr.height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[y * stride + x - channels] : 0;
      const b = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rows[y * stride + x] = v & 255;
    }
  }

  const rgba = Buffer.alloc(ihdr.width * ihdr.height * 4);
  for (let i = 0; i < ihdr.width * ihdr.height; i++) {
    const s = i * channels;
    let r, g, b, a = 255;
    if (ihdr.colour === 6) { r = rows[s]; g = rows[s + 1]; b = rows[s + 2]; a = rows[s + 3]; }
    else if (ihdr.colour === 2) { r = rows[s]; g = rows[s + 1]; b = rows[s + 2]; }
    else if (ihdr.colour === 0) { r = g = b = rows[s]; }
    else if (ihdr.colour === 4) { r = g = b = rows[s]; a = rows[s + 1]; }
    else {
      const index = rows[s];
      r = palette[index * 3]; g = palette[index * 3 + 1]; b = palette[index * 3 + 2];
      if (transparency && index < transparency.length) a = transparency[index];
    }
    rgba.set([r, g, b, a], i * 4);
  }
  return { width: ihdr.width, height: ihdr.height, data: rgba };
}

function averagePatch({ data, width }, x, y, size) {
  let r = 0, g = 0, b = 0, a = 0;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const i = ((y + dy) * width + (x + dx)) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
    }
  }
  const n = size * size;
  return [r / n, g / n, b / n, a / n];
}

function check(image) {
  const { width, height } = image;
  const size = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const inset = Math.max(size + 1, Math.round(Math.min(width, height) * 0.2));
  const corners = [
    [0, 0, inset, inset],
    [width - size, 0, width - inset - size, inset],
    [0, height - size, inset, height - inset - size],
    [width - size, height - size, width - inset - size, height - inset - size],
  ];
  let transparentCorners = false;
  let differentCorners = false;
  for (const [cx, cy, ix, iy] of corners) {
    const corner = averagePatch(image, cx, cy, size);
    const inside = averagePatch(image, ix, iy, size);
    if (corner[3] < CORNER_MIN_ALPHA) { transparentCorners = true; continue; }
    if (Math.hypot(corner[0] - inside[0], corner[1] - inside[1], corner[2] - inside[2]) > CORNER_COLOUR_DISTANCE) differentCorners = true;
  }
  return { transparentCorners, differentCorners };
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node docs/design/atrium/tools/check-icon.js icon.png');
  process.exit(2);
}
let image;
let bytes;
try {
  bytes = fs.readFileSync(file);
  image = readPng(bytes);
} catch (e) {
  console.error(`${file}: ${e.message}`);
  process.exit(2);
}

const problems = [];
if (image.width !== image.height) problems.push(`It is ${image.width} x ${image.height}. The icon must be square.`);
if (Math.min(image.width, image.height) < MIN_SIZE) problems.push(`It is smaller than ${MIN_SIZE} x ${MIN_SIZE}. Use at least that, so it stays sharp on large screens.`);
if (bytes.length > MAX_BYTES) problems.push('It is over 2 MB, which the Build an app form will not accept.');
const { transparentCorners, differentCorners } = check(image);
if (transparentCorners) problems.push('The corners are transparent, so the colour behind the icon will show. Make the image fill the whole square.');
if (differentCorners) problems.push('The corners are a different colour from the rest of the icon, as if a rounded icon sits on a square background. Make the image fill the whole canvas. COHO rounds the corners itself.');

console.log(`${file}: ${image.width} x ${image.height}`);
if (problems.length === 0) {
  console.log('OK: the icon fills the square.');
} else {
  for (const p of problems) console.log(`FIX: ${p}`);
  process.exit(1);
}
