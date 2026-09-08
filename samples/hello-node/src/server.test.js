import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import {
  EXTERNAL_CONFIG_PATH,
  QUICK_VIEW_PATH,
  configs,
  connections,
  loadConnection,
  loadState,
  persistState,
  resetState,
  setStateFile,
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
 */
async function request(listener, method, requestPath, headers = {}) {
  const server = http.createServer(listener);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${requestPath}`, {
      method,
      headers,
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
  assert.match(response.body, /postMessage\(\{ type: 'atrium\.quickView\.close' \}, "http:\/\/localhost:4200"\)/);
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
