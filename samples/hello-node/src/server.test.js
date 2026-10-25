import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EXTERNAL_CONFIG_PATH,
  QUICK_VIEW_PATH,
  STEPS,
  configs,
  connections,
  loadConnection,
  loadState,
  mintPageToken,
  persistState,
  resetState,
  setStateFile,
  stepOrders,
  verifyPageToken,
} from './lib.js';
import { createRequestListener } from './server.js';

afterEach(() => {
  resetState();
  delete process.env.ATRIUM_FRAME_ANCESTORS;
  delete process.env.ATRIUM_PARENT_ORIGIN;
});

/**
 * @param {string} secret
 * @param {string} method
 * @param {string} pathAndQuery
 * @param {string} connectionReference
 */
function createTestSignature(secret, method, pathAndQuery, connectionReference) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${timestamp}.${method}.${pathAndQuery}.${connectionReference}.`;
  const v1 = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/**
 * @param {import('node:http').RequestListener} listener
 * @param {string} method
 * @param {string} requestPath
 * @param {Record<string, string>} [headers]
 * @param {string} [body]
 */
async function request(listener, method, requestPath, headers = {}, body) {
  const server = http.createServer(listener);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${requestPath}`, {
      method,
      headers,
      body,
    });
    const text = await response.text();
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: text,
    };
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('quick view rejects missing signature', async () => {
  const connectionReference = '11111111-1111-1111-1111-111111111111';
  connections.set(connectionReference, {
    signingSecret: 'sample-secret',
    apiKey: '',
    apiBaseUrl: '',
  });
  const listener = createRequestListener({ setupBootstrapSecret: 'bootstrap' });
  const response = await request(
    listener,
    'GET',
    `${QUICK_VIEW_PATH}?connectionReference=${connectionReference}`,
  );
  assert.equal(response.status, 401);
});

test('quick view escapes greeting HTML', async () => {
  const connectionReference = '11111111-1111-1111-1111-111111111111';
  const secret = 'sample-secret';
  connections.set(connectionReference, {
    signingSecret: secret,
    apiKey: '',
    apiBaseUrl: '',
  });
  configs.set(connectionReference, { greeting: '<script>alert(1)</script>' });
  process.env.ATRIUM_FRAME_ANCESTORS = 'https://labs.coho.life';

  const pathAndQuery = `${QUICK_VIEW_PATH}?connectionReference=${connectionReference}`;
  const signature = createTestSignature(secret, 'GET', pathAndQuery, connectionReference);
  const listener = createRequestListener({ setupBootstrapSecret: 'bootstrap' });
  const response = await request(
    listener,
    'GET',
    `${pathAndQuery}&atriumSignature=${encodeURIComponent(signature)}`,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-security-policy'], 'frame-ancestors https://labs.coho.life');
  assert.equal(response.body.includes('<script>alert(1)</script>'), false);
  assert.equal(response.body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true);
  assert.equal(response.body.includes('Node sample app'), true);
  assert.equal(response.body.includes("'*'"), false);
  assert.match(response.body, /var parentOrigin = "http:\/\/localhost:4200"/);
  assert.match(response.body, /atrium\.quickView\.theme/);
  assert.match(response.body, /atrium\.quickView\.ready/);
  assert.match(response.body, /atrium\.quickView\.close/);
});

/** A signed quick view launch for the connection, with the signing secret registered. */
function registerQuickView(connectionReference, secret) {
  connections.set(connectionReference, { signingSecret: secret, apiKey: '', apiBaseUrl: '' });
  const pathAndQuery = `${QUICK_VIEW_PATH}?connectionReference=${connectionReference}`;
  const signature = createTestSignature(secret, 'GET', pathAndQuery, connectionReference);
  return `${pathAndQuery}&atriumSignature=${encodeURIComponent(signature)}`;
}

test('page token is bound to its connection and expires', () => {
  const connectionReference = '44444444-4444-4444-4444-444444444444';
  const secret = 'page-secret';
  const minted = new Date('2026-10-22T10:00:00Z');
  const token = mintPageToken(connectionReference, secret, minted);
  assert.equal(verifyPageToken(token, connectionReference, secret, new Date('2026-10-22T10:30:00Z')), true);
  assert.equal(verifyPageToken(token, 'other-connection', secret, minted), false);
  assert.equal(verifyPageToken(token, connectionReference, 'other-secret', minted), false);
  assert.equal(verifyPageToken(token, connectionReference, secret, new Date('2026-10-22T11:00:01Z')), false);
  assert.equal(verifyPageToken(token, connectionReference, undefined, minted), false);
  assert.equal(verifyPageToken('t=1,v1=nope', connectionReference, secret, minted), false);
});

test('quick view renders the checklist and mints its page token', async () => {
  const connectionReference = '55555555-5555-5555-5555-555555555555';
  const launch = registerQuickView(connectionReference, 'checklist-secret');
  const listener = createRequestListener({ setupBootstrapSecret: 'bootstrap' });
  const response = await request(listener, 'GET', launch);
  assert.equal(response.status, 200);
  assert.match(response.body, /<script src="\/design\/reorder\.js"><\/script>/);
  for (const step of STEPS) assert.match(response.body, new RegExp(`data-id="${step.id}"`));
  const token = /"token":"(t=\d+,v1=[0-9a-f]{64})"/.exec(response.body);
  assert.match(response.body, /class="icon icon--light-grey"><svg class="icon-drag-handle"/);
  assert.ok(token, 'the page carries a page token');
  assert.equal(verifyPageToken(token[1], connectionReference, 'checklist-secret'), true);
  assert.match(response.body, new RegExp(`"connectionReference":"${connectionReference}"`));
});

test('checklist order is saved per connection and rendered in that order', async () => {
  const connectionReference = '66666666-6666-6666-6666-666666666666';
  const secret = 'order-secret';
  const launch = registerQuickView(connectionReference, secret);
  const listener = createRequestListener({ setupBootstrapSecret: 'bootstrap' });
  const order = ['invoice', 'inspect', 'report'];

  const saved = await request(
    listener,
    'POST',
    '/steps/order',
    { 'Content-Type': 'application/json' },
    JSON.stringify({ connectionReference, token: mintPageToken(connectionReference, secret), order }),
  );
  assert.equal(saved.status, 200);
  assert.deepEqual(JSON.parse(saved.body), { ok: true, order });
  assert.deepEqual(stepOrders.get(connectionReference), order);

  const page = await request(listener, 'GET', launch);
  const positions = order.map((id) => page.body.indexOf(`data-id="${id}"`));
  assert.ok(positions.every((p) => p >= 0));
  assert.deepEqual(positions, positions.slice().sort((a, b) => a - b));
  assert.match(page.body, /card__detail--step-index">1<\/span>[\s\S]*Raise the invoice/);

  const otherLaunch = registerQuickView('77777777-7777-7777-7777-777777777777', 'other-secret');
  const other = await request(listener, 'GET', otherLaunch);
  const defaults = STEPS.map((step) => other.body.indexOf(`data-id="${step.id}"`));
  assert.deepEqual(defaults, defaults.slice().sort((a, b) => a - b));
});

test('checklist order rejects a bad token and a bad order', async () => {
  const connectionReference = '88888888-8888-8888-8888-888888888888';
  const secret = 'reject-secret';
  registerQuickView(connectionReference, secret);
  const listener = createRequestListener({ setupBootstrapSecret: 'bootstrap' });
  const headers = { 'Content-Type': 'application/json' };

  const badToken = await request(listener, 'POST', '/steps/order', headers, JSON.stringify({ connectionReference, token: 't=1,v1=00', order: ['invoice', 'inspect', 'report'] }));
  assert.equal(badToken.status, 401);
  const otherConnection = await request(listener, 'POST', '/steps/order', headers, JSON.stringify({ connectionReference: 'unknown', token: mintPageToken(connectionReference, secret), order: ['invoice', 'inspect', 'report'] }));
  assert.equal(otherConnection.status, 401);
  const token = mintPageToken(connectionReference, secret);
  const missing = await request(listener, 'POST', '/steps/order', headers, JSON.stringify({ connectionReference, token, order: ['invoice', 'inspect'] }));
  assert.equal(missing.status, 400);
  const duplicate = await request(listener, 'POST', '/steps/order', headers, JSON.stringify({ connectionReference, token, order: ['invoice', 'invoice', 'report'] }));
  assert.equal(duplicate.status, 400);
  const unknownStep = await request(listener, 'POST', '/steps/order', headers, JSON.stringify({ connectionReference, token, order: ['invoice', 'inspect', 'other'] }));
  assert.equal(unknownStep.status, 400);
  const invalidJson = await request(listener, 'POST', '/steps/order', headers, '{');
  assert.equal(invalidJson.status, 400);
  assert.equal(stepOrders.has(connectionReference), false);
});

test('checklist order survives reload', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hello-node-order-'));
  setStateFile(path.join(dir, 'hello-node-state.json'));
  const connectionReference = '99999999-9999-9999-9999-999999999999';
  connections.set(connectionReference, { signingSecret: 'persisted', apiKey: '', apiBaseUrl: '' });
  stepOrders.set(connectionReference, ['report', 'invoice', 'inspect']);
  await persistState();
  stepOrders.clear();
  await loadState();
  assert.deepEqual(stepOrders.get(connectionReference), ['report', 'invoice', 'inspect']);
});

test('rendered quick view passes the design checker', async () => {
  const launch = registerQuickView('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'checker-secret');
  const listener = createRequestListener({ setupBootstrapSecret: 'bootstrap' });
  const page = await request(listener, 'GET', launch);
  assert.equal(page.status, 200);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hello-node-page-'));
  const file = path.join(dir, 'ui.html');
  await fs.writeFile(file, page.body, 'utf8');
  const checker = fileURLToPath(new URL('../design/check.cjs', import.meta.url));
  const output = execFileSync(process.execPath, [checker, file], { encoding: 'utf8' });
  assert.match(output, /All checks passed/);
});

test('external configure requires signed launch', async () => {
  const connectionReference = '33333333-3333-3333-3333-333333333333';
  const secret = 'external-secret';
  connections.set(connectionReference, {
    signingSecret: secret,
    apiKey: '',
    apiBaseUrl: '',
  });

  const listener = createRequestListener({ setupBootstrapSecret: 'bootstrap' });
  const unsigned = await request(
    listener,
    'GET',
    `${EXTERNAL_CONFIG_PATH}?connectionReference=${connectionReference}`,
  );
  assert.equal(unsigned.status, 401);

  const pathAndQuery = `${EXTERNAL_CONFIG_PATH}?connectionReference=${connectionReference}`;
  const signature = createTestSignature(secret, 'GET', pathAndQuery, connectionReference);
  const signed = await request(
    listener,
    'GET',
    `${pathAndQuery}&atriumSignature=${encodeURIComponent(signature)}`,
  );
  assert.equal(signed.status, 200);
  assert.equal(signed.body.includes('external configuration surface'), true);
});

test('persistence survives reload', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hello-node-'));
  const file = path.join(dir, 'hello-node-state.json');
  setStateFile(file);

  const connectionReference = '22222222-2222-2222-2222-222222222222';
  connections.set(connectionReference, {
    signingSecret: 'persisted-secret',
    apiKey: 'api-key-guid',
    apiBaseUrl: 'https://api.example.com',
  });
  configs.set(connectionReference, { greeting: 'Persistent hello' });

  await persistState();

  connections.clear();
  configs.clear();
  await loadState();

  const state = loadConnection(connectionReference);
  assert.ok(state);
  assert.equal(state.signingSecret, 'persisted-secret');
  assert.equal(state.apiKey, 'api-key-guid');
  assert.equal(state.apiBaseUrl, 'https://api.example.com');
  assert.equal(configs.get(connectionReference)?.greeting, 'Persistent hello');

  const info = await fs.stat(file);
  assert.equal(info.mode & 0o777, 0o600);

  const persisted = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(persisted.secrets, undefined);
});
