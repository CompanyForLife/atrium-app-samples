import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { afterEach, test } from 'node:test';
import { connections, createRequestListener, resetState } from './server.js';

afterEach(() => {
  resetState();
});

/**
 * @param {string} secret
 * @param {string} method
 * @param {string} pathAndQuery
 * @param {string} connectionReference
 * @param {string} [rawBody]
 */
function createTestSignature(secret, method, pathAndQuery, connectionReference, rawBody = '') {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${timestamp}.${method}.${pathAndQuery}.${connectionReference}.${rawBody}`;
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
      body: text,
      json: () => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      },
    };
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('health reports agent class', async () => {
  const listener = createRequestListener({ setupBootstrapSecret: 'bootstrap' });
  const response = await request(listener, 'GET', '/health');
  assert.equal(response.status, 200);
  const body = response.json();
  assert.equal(body.class, 'agent');
  assert.match(body.message, /no UI/);
});

test('/ui is not a quick view (404 with guidance)', async () => {
  const listener = createRequestListener({ setupBootstrapSecret: 'bootstrap' });
  const response = await request(listener, 'GET', '/ui');
  assert.equal(response.status, 404);
  assert.match(response.body, /hello-node/);
});

test('light config schema requires signed connection', async () => {
  const connectionReference = '11111111-1111-1111-1111-111111111111';
  connections.set(connectionReference, {
    signingSecret: 'sample-secret',
    apiKey: '',
    apiBaseUrl: '',
  });
  const pathAndQuery = `/config/schema?connectionReference=${connectionReference}`;
  const signature = createTestSignature('sample-secret', 'GET', pathAndQuery, connectionReference);
  const listener = createRequestListener({ setupBootstrapSecret: 'bootstrap' });
  const response = await request(listener, 'GET', pathAndQuery, {
    'x-atrium-signature': signature,
  });
  assert.equal(response.status, 200);
  const schema = response.json();
  assert.equal(schema.properties.dryRun.type, 'boolean');
});

test('event webhook without connectionReference returns 400', async () => {
  const listener = createRequestListener({ setupBootstrapSecret: 'bootstrap' });
  const response = await request(
    listener,
    'POST',
    '/webhooks/atrium/triggers/event',
    { 'content-type': 'application/json' },
    JSON.stringify({ type: 'event.atrium.test' }),
  );
  assert.equal(response.status, 400);
  assert.match(response.body, /connectionReference/);
});

test('invalid request URL does not crash the listener', async () => {
  const listener = createRequestListener({ setupBootstrapSecret: 'bootstrap' });
  // Path-only URL parsing uses a fixed base; odd Host header must not throw out of the handler.
  const response = await request(listener, 'GET', '/health', { host: 'bad host!!' });
  assert.equal(response.status, 200);
});
