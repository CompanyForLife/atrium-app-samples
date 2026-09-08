#!/usr/bin/env node
/** Minimal Atrium self-host app (Node stdlib only). */

import crypto from 'node:crypto';
import http from 'node:http';

const ATRIUM_SIGNATURE_HEADER = 'x-atrium-signature';
const DEFAULT_TOLERANCE_SECONDS = 300;
const MAX_FUTURE_SKEW_SECONDS = 30;
const QUICK_VIEW_PATH = '/ui';
const MAX_BODY_BYTES = 1024 * 1024;

const port = Number.parseInt(process.env.PORT || '5100', 10);
const setupBootstrapSecret = process.env.ATRIUM_SETUP_SECRET;
if (!setupBootstrapSecret) {
  throw new Error('ATRIUM_SETUP_SECRET is required');
}
const frameAncestors = sanitizeFrameAncestors(
  process.env.ATRIUM_FRAME_ANCESTORS || 'http://localhost:4200 http://127.0.0.1:4200',
);

/** @type {Map<string, string>} */
const secrets = new Map();
/** @type {Map<string, Record<string, unknown>>} */
const configs = new Map();

const CONFIG_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  title: 'Hello Atrium settings',
  additionalProperties: false,
  properties: {
    greeting: {
      type: 'string',
      title: 'Greeting',
      description: 'Shown at the top of the app quick view.',
      default: 'Hello from Atrium',
      minLength: 1,
      maxLength: 120,
    },
  },
  required: ['greeting'],
};

function pathAndQueryForSignature(url) {
  const query = url.search.startsWith('?') ? url.search.slice(1) : '';
  const filtered = query
    .split('&')
    .filter(
      (part) =>
        part &&
        part !== 'atriumSignature' &&
        !part.toLowerCase().startsWith('atriumsignature='),
    );
  return filtered.length ? `${url.pathname}?${filtered.join('&')}` : url.pathname;
}

/**
 * @param {string} rawBody
 * @param {string | string[] | undefined} signatureHeader
 * @param {string} signingSecret
 * @param {{ method: string, pathAndQuery: string, connectionReference: string }} request
 * @param {Date} [now]
 * @param {number} [toleranceSeconds]
 */
function verifyAtriumSignature(
  rawBody,
  signatureHeader,
  signingSecret,
  request,
  now = new Date(),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
) {
  const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (typeof rawBody !== 'string' || !header || !signingSecret) return false;
  if (!request?.method || !request?.pathAndQuery || !request?.connectionReference) return false;

  let timestamp = null;
  let v1 = null;
  for (const part of header.split(',')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (key === 't') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) timestamp = parsed;
    } else if (key === 'v1') {
      v1 = value.trim().toLowerCase();
    }
  }

  if (timestamp == null || !v1) return false;

  const nowSeconds = now.getTime() / 1000;
  if (timestamp > nowSeconds + MAX_FUTURE_SKEW_SECONDS) return false;
  if (nowSeconds - timestamp > toleranceSeconds) return false;

  const method = String(request.method).trim().toUpperCase();
  const signedPayload = `${timestamp}.${method}.${request.pathAndQuery}.${request.connectionReference}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(signedPayload, 'utf8')
    .digest('hex')
    .toLowerCase();

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(v1, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

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

function sanitizeFrameAncestors(value) {
  const trimmed = String(value || "'none'").trim();
  if (!/^[\w\s'*.:\/\-,]+$/.test(trimmed)) {
    return "'none'";
  }
  return trimmed;
}

/**
 * @param {string} connectionReference
 */
function quickViewHtml(connectionReference) {
  const greeting = configs.get(connectionReference)?.greeting || 'Hello from Atrium';
  const safeGreeting = String(greeting).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeRef = String(connectionReference || '').replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Hello Atrium</title>
  <style>
    body { font-family: Georgia, serif; margin: 1.5rem; color: #1a1a1a; background: #f7f4ef; }
    button { margin-top: 1rem; padding: 0.5rem 0.9rem; }
  </style>
</head>
<body>
  <h1>${safeGreeting}</h1>
  <p>Quick view for connection <code>${safeRef}</code>.</p>
  <p>This page is intentionally third-party styled.</p>
  <button type="button" id="close">Close</button>
  <script>
    document.getElementById('close').addEventListener('click', () => {
      parent.postMessage({ type: 'atrium.quickView.close' }, '*');
    });
  </script>
</body>
</html>`;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} connectionReference
 * @param {string} rawBody
 */
async function verifyConnectionSignature(req, res, url, connectionReference, rawBody, signatureHeaderOverride) {
  if (!connectionReference) {
    sendJson(res, 400, { ok: false, message: 'connectionReference required' });
    return false;
  }

  const secret = secrets.get(connectionReference);
  if (!secret) {
    sendJson(res, 401, { ok: false, message: 'Unknown connection' });
    return false;
  }
  const header = signatureHeaderOverride || req.headers[ATRIUM_SIGNATURE_HEADER];
  if (!verifyAtriumSignature(rawBody, header, secret, {
    method: req.method,
    pathAndQuery: pathAndQueryForSignature(url),
    connectionReference,
  })) {
    sendJson(res, 401, { ok: false, message: 'Invalid signature' });
    return false;
  }
  return true;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {(connectionReference: string, rawBody: string) => unknown | Promise<unknown>} handler
 */
async function handleSignedConfig(req, res, url, handler) {
  const connectionReference = url.searchParams.get('connectionReference');
  if (!connectionReference) {
    sendJson(res, 400, { ok: false, message: 'connectionReference query required' });
    return;
  }

  const rawBody = await readRawBody(req);
  if (!(await verifyConnectionSignature(req, res, url, connectionReference, rawBody))) {
    return;
  }

  try {
    const result = await handler(connectionReference, rawBody);
    sendJson(res, 200, result);
  } catch (err) {
    if (err?.statusCode === 400) {
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
 * @param {(envelope: Record<string, unknown>, rawBody: string) => void | Promise<void>} handler
 */
async function handleSignedWebhook(req, res, url, handler) {
  const rawBody = await readRawBody(req);
  let envelope;
  try {
    envelope = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    sendJson(res, 400, { ok: false, message: 'Invalid JSON' });
    return;
  }

  const connectionReference = envelope.connectionReference;
  if (typeof connectionReference !== 'string' || !(await verifyConnectionSignature(req, res, url, connectionReference, rawBody))) {
    return;
  }

  try {
    await handler(envelope, rawBody);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error('[hello-node] handler error', err);
    sendJson(res, 500, { ok: false, message: err?.message || 'Handler failed' });
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} rawBody
 */
async function handleSetup(req, res, url, rawBody) {
  let envelope;
  try {
    envelope = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    sendJson(res, 400, { ok: false, message: 'Invalid JSON' });
    return;
  }

  const setupSecret = envelope?.data?.signingSecret;
  const header = req.headers[ATRIUM_SIGNATURE_HEADER];
  const request = {
    method: req.method,
    pathAndQuery: pathAndQueryForSignature(url),
    connectionReference: envelope.connectionReference,
  };

  if (!setupSecret) {
    sendJson(res, 401, { ok: false, message: 'Missing signing secret in setup' });
    return;
  }
  if (!verifyAtriumSignature(rawBody, header, setupBootstrapSecret, request)) {
    sendJson(res, 401, { ok: false, message: 'Invalid signature' });
    return;
  }

  const connectionReference = envelope.connectionReference;
  if (!connectionReference) {
    sendJson(res, 400, { ok: false, message: 'Missing connectionReference' });
    return;
  }

  console.log('[hello-node] setup', {
    connectionReference,
    organisationReference: envelope.organisationReference,
  });
  secrets.set(connectionReference, setupSecret);
  configs.set(connectionReference, { greeting: 'Hello from Atrium' });
  sendJson(res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/$/, '') || '/';

  try {
    if (req.method === 'GET' && path === '/health') {
      sendJson(res, 200, {
        ok: true,
        message: `hello-node; connections=${secrets.size}`,
      });
      return;
    }

    if (req.method === 'GET' && path === '/config/schema') {
      await handleSignedConfig(req, res, url, async () => CONFIG_SCHEMA);
      return;
    }

    if (req.method === 'GET' && path === '/config') {
      await handleSignedConfig(req, res, url, async (connectionReference) =>
        configs.get(connectionReference) || {},
      );
      return;
    }

    if (req.method === 'PUT' && path === '/config') {
      await handleSignedConfig(req, res, url, async (connectionReference, rawBody) => {
        let config;
        try {
          config = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          const err = new Error('Invalid JSON');
          err.statusCode = 400;
          throw err;
        }
        configs.set(connectionReference, config);
        console.log('[hello-node] config saved', connectionReference);
        return config;
      });
      return;
    }

    if (req.method === 'GET' && path === QUICK_VIEW_PATH) {
      const connectionReference = url.searchParams.get('connectionReference');
      if (!(await verifyConnectionSignature(
        req,
        res,
        url,
        connectionReference,
        '',
        url.searchParams.get('atriumSignature'),
      ))) {
        return;
      }
      const html = quickViewHtml(connectionReference);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
        'Content-Security-Policy': `frame-ancestors ${frameAncestors}`,
      });
      res.end(html);
      return;
    }

    if (req.method === 'POST' && path === '/webhooks/atrium/setup') {
      await handleSetup(req, res, url, await readRawBody(req));
      return;
    }

    if (req.method === 'POST' && path === '/webhooks/atrium/disconnect') {
      await handleSignedWebhook(req, res, url, async (envelope) => {
        console.log('[hello-node] disconnect', envelope.connectionReference);
        secrets.delete(envelope.connectionReference);
        configs.delete(envelope.connectionReference);
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

    sendJson(res, 404, { ok: false, message: 'Not found' });
  } catch (err) {
    if (err?.statusCode === 413) {
      sendJson(res, 413, { ok: false, message: 'Payload too large' });
      return;
    }
    console.error('[hello-node] request error', err);
    sendJson(res, 500, { ok: false, message: 'Server error' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[hello-node] listening on http://0.0.0.0:${port}`);
});
