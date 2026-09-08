#!/usr/bin/env node
/** Minimal Atrium self-host app (Node stdlib only). */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATRIUM_SIGNATURE_HEADER,
  CONFIG_SCHEMA,
  EXTERNAL_CONFIG_PATH,
  MAX_BODY_BYTES,
  QUICK_VIEW_PATH,
  configureDataDir,
  configs,
  connections,
  deleteConnectionState,
  externalConfigHtml,
  loadSecret,
  loadState,
  parentOrigin,
  pathAndQueryForSignature,
  quickViewHtml,
  runPublicAPIProbes,
  sanitizeFrameAncestors,
  storeConfigState,
  storeConnectionState,
  verifyAtriumSignature,
} from './lib.js';

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} body
 * @param {Record<string, string>} [extraHeaders]
 */
function sendHtml(res, body, extraHeaders = {}) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
async function readRawBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const err = new Error('Payload too large');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Browser launch (query atriumSignature, empty body) — matches Go verifyBrowserLaunch.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @returns {string | null}
 */
function verifyBrowserLaunch(req, res, url) {
  const connectionReference = url.searchParams.get('connectionReference') || '';
  const secret = loadSecret(connectionReference);
  if (
    !secret ||
    !verifyAtriumSignature('', url.searchParams.get('atriumSignature') || '', secret, {
      method: req.method || 'GET',
      pathAndQuery: pathAndQueryForSignature(url),
      connectionReference,
    })
  ) {
    sendJson(res, 401, { ok: false, message: 'Invalid signature' });
    return null;
  }
  return connectionReference;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {string} connectionReference
 * @param {string} rawBody
 * @param {string | string[] | undefined} [signatureHeaderOverride]
 */
function verifyConnectionSignature(req, res, url, connectionReference, rawBody, signatureHeaderOverride) {
  if (!connectionReference) {
    sendJson(res, 400, { ok: false, message: 'connectionReference required' });
    return false;
  }

  const secret = loadSecret(connectionReference);
  if (!secret) {
    sendJson(res, 401, { ok: false, message: 'Unknown connection' });
    return false;
  }
  const header = signatureHeaderOverride || req.headers[ATRIUM_SIGNATURE_HEADER];
  if (
    !verifyAtriumSignature(rawBody, header, secret, {
      method: req.method || '',
      pathAndQuery: pathAndQueryForSignature(url),
      connectionReference,
    })
  ) {
    sendJson(res, 401, { ok: false, message: 'Invalid signature' });
    return false;
  }
  return true;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {boolean} allowBody
 * @param {(connectionReference: string, rawBody: string) => unknown | Promise<unknown>} handler
 */
async function handleSignedConfig(req, res, url, allowBody, handler) {
  const connectionReference = url.searchParams.get('connectionReference');
  if (!connectionReference) {
    sendJson(res, 400, { ok: false, message: 'connectionReference query required' });
    return;
  }

  const rawBody = allowBody ? await readRawBody(req) : '';
  if (!verifyConnectionSignature(req, res, url, connectionReference, rawBody)) {
    return;
  }

  try {
    const result = await handler(connectionReference, rawBody);
    sendJson(res, 200, result);
  } catch (err) {
    if (err?.message === 'Invalid JSON' || err?.statusCode === 400) {
      sendJson(res, 400, { ok: false, message: err.message || 'Bad request' });
      return;
    }
    console.error('[hello-node] config error', err);
    sendJson(res, 500, { ok: false, message: err?.message || 'Config handler failed' });
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {(envelope: Record<string, unknown>) => void | Promise<void>} handler
 */
async function handleSignedWebhook(req, res, url, handler) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'Method not allowed' });
    return;
  }

  const rawBody = await readRawBody(req);
  let envelope;
  try {
    envelope = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    sendJson(res, 400, { ok: false, message: 'Invalid JSON' });
    return;
  }

  const connectionReference = envelope.connectionReference;
  if (typeof connectionReference !== 'string' || !verifyConnectionSignature(req, res, url, connectionReference, rawBody)) {
    return;
  }

  try {
    await handler(envelope);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error('[hello-node] handler error', err);
    sendJson(res, 500, { ok: false, message: err?.message || 'Handler failed' });
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {string} setupBootstrapSecret
 * @param {string} rawBody
 */
async function handleSetup(req, res, url, setupBootstrapSecret, rawBody) {
  let envelope;
  try {
    envelope = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    sendJson(res, 400, { ok: false, message: 'Invalid JSON' });
    return;
  }

  const data = envelope?.data && typeof envelope.data === 'object' ? envelope.data : {};
  const setupSecret = typeof data.signingSecret === 'string' ? data.signingSecret : '';
  if (!setupSecret) {
    sendJson(res, 401, { ok: false, message: 'Missing signing secret in setup' });
    return;
  }

  const connectionReference = envelope.connectionReference;
  if (!connectionReference) {
    sendJson(res, 400, { ok: false, message: 'Missing connectionReference' });
    return;
  }

  if (
    !verifyAtriumSignature(rawBody, req.headers[ATRIUM_SIGNATURE_HEADER], setupBootstrapSecret, {
      method: req.method || 'POST',
      pathAndQuery: pathAndQueryForSignature(url),
      connectionReference,
    })
  ) {
    sendJson(res, 401, { ok: false, message: 'Invalid signature' });
    return;
  }

  const apiKey = typeof data.apiKey === 'string' ? data.apiKey : '';
  let apiBaseUrl = typeof data.apiBaseUrl === 'string' ? data.apiBaseUrl : '';
  apiBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');

  console.log('[hello-node] setup', {
    connectionReference,
    organisationReference: envelope.organisationReference,
    apiBaseUrl,
  });

  try {
    await storeConnectionState(connectionReference, {
      signingSecret: setupSecret,
      apiKey,
      apiBaseUrl,
    });
  } catch (err) {
    console.error('[hello-node] persist setup failed', err);
    sendJson(res, 500, { ok: false, message: 'Could not persist setup' });
    return;
  }
  sendJson(res, 200, { ok: true });
}

/**
 * @param {{ setupBootstrapSecret: string }} options
 */
export function createRequestListener(options) {
  const { setupBootstrapSecret } = options;

  return async function requestListener(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname.replace(/\/$/, '') || '/';

    try {
      if (req.method === 'GET' && path === '/health') {
        sendJson(res, 200, {
          ok: true,
          message: `hello-node; connections=${connections.size}`,
        });
        return;
      }

      if (req.method === 'GET' && path === '/config/schema') {
        await handleSignedConfig(req, res, url, false, async () => CONFIG_SCHEMA);
        return;
      }

      if (req.method === 'GET' && path === '/config') {
        await handleSignedConfig(req, res, url, false, async (connectionReference) =>
          configs.get(connectionReference) || {},
        );
        return;
      }

      if (req.method === 'PUT' && path === '/config') {
        await handleSignedConfig(req, res, url, true, async (connectionReference, rawBody) => {
          let config;
          try {
            config = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            const err = new Error('Invalid JSON');
            err.statusCode = 400;
            throw err;
          }
          await storeConfigState(connectionReference, config);
          console.log('[hello-node] config saved', connectionReference);
          return config;
        });
        return;
      }

      if (req.method === 'GET' && path === QUICK_VIEW_PATH) {
        const connectionReference = verifyBrowserLaunch(req, res, url);
        if (!connectionReference) return;

        let greeting = 'Hello from Atrium';
        const config = configs.get(connectionReference);
        if (config && typeof config.greeting === 'string' && config.greeting) {
          greeting = config.greeting;
        }

        const probes = await runPublicAPIProbes(connectionReference);
        const frameAncestors = sanitizeFrameAncestors(process.env.ATRIUM_FRAME_ANCESTORS);
        const html = quickViewHtml(greeting, parentOrigin(), probes);
        sendHtml(res, html, {
          'Content-Security-Policy': `frame-ancestors ${frameAncestors}`,
        });
        return;
      }

      if (req.method === 'GET' && path === EXTERNAL_CONFIG_PATH) {
        if (!verifyBrowserLaunch(req, res, url)) return;
        sendHtml(res, externalConfigHtml());
        return;
      }

      if (req.method === 'POST' && path === '/webhooks/atrium/setup') {
        await handleSetup(req, res, url, setupBootstrapSecret, await readRawBody(req));
        return;
      }

      if (req.method === 'POST' && path === '/webhooks/atrium/disconnect') {
        await handleSignedWebhook(req, res, url, async (envelope) => {
          console.log('[hello-node] disconnect', envelope.connectionReference);
          await deleteConnectionState(/** @type {string} */ (envelope.connectionReference));
        });
        return;
      }

      if (req.method === 'POST' && path === '/webhooks/atrium/triggers/event') {
        await handleSignedWebhook(req, res, url, async (envelope) => {
          console.log('[hello-node] event', envelope.type, envelope.deliveryId);
        });
        return;
      }

      if (req.method === 'POST' && path === '/webhooks/atrium/triggers/schedule') {
        await handleSignedWebhook(req, res, url, async (envelope) => {
          console.log('[hello-node] schedule', envelope.type, envelope.deliveryId);
        });
        return;
      }

      if (req.method !== 'GET' && (path === QUICK_VIEW_PATH || path === EXTERNAL_CONFIG_PATH || path === '/health')) {
        sendJson(res, 405, { ok: false, message: 'Method not allowed' });
        return;
      }

      sendJson(res, 404, { ok: false, message: 'Not found' });
    } catch (err) {
      if (err?.statusCode === 413) {
        sendJson(res, 413, { ok: false, message: 'Payload too large' });
        return;
      }
      console.error('[hello-node] request error', err);
      sendJson(res, 500, { ok: false, message: 'Server error' });
    }
  };
}

/**
 * @param {{ setupBootstrapSecret?: string, port?: number }} [options]
 */
export async function startServer(options = {}) {
  const setupBootstrapSecret = options.setupBootstrapSecret ?? process.env.ATRIUM_SETUP_SECRET;
  if (!setupBootstrapSecret) {
    throw new Error('ATRIUM_SETUP_SECRET is required');
  }

  const dataDir = process.env.ATRIUM_DATA_DIR;
  if (dataDir) {
    configureDataDir(dataDir);
    await loadState();
  }

  const port = options.port ?? Number.parseInt(process.env.PORT || '5100', 10);
  const listener = createRequestListener({ setupBootstrapSecret });
  const server = http.createServer(listener);

  await new Promise((resolve, reject) => {
    server.listen(port, '0.0.0.0', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  console.log(`[hello-node] listening on http://0.0.0.0:${port}`);
  return server;
}

const isMain =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
