#!/usr/bin/env node
/**
 * Agent-class hello sample (Node stdlib only).
 *
 * EXCEPTION: no quick view / no app UI. Prefer samples/hello-node for almost every app.
 * See README.md in this folder.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ATRIUM_SIGNATURE_HEADER = 'x-atrium-signature';
const DEFAULT_TOLERANCE_SECONDS = 300;
const MAX_FUTURE_SKEW_SECONDS = 30;
const MAX_BODY_BYTES = 1024 * 1024;

/** @typedef {{ signingSecret: string, apiKey: string, apiBaseUrl: string }} ConnectionState */

/** @type {Map<string, ConnectionState>} */
const connections = new Map();
/** @type {Map<string, Record<string, unknown>>} */
const configs = new Map();

/** @type {string} */
let stateFile = '';

const CONFIG_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  title: 'Hello agent settings',
  description: 'Light prefs only. This sample has no quick view — do not put product UI here.',
  additionalProperties: false,
  properties: {
    dryRun: {
      type: 'boolean',
      title: 'Dry run',
      description: 'When true, log what would run instead of calling the Public API.',
      default: true,
    },
    note: {
      type: 'string',
      title: 'Operator note',
      description: 'Optional note for Store prefs only (not shown in an app UI).',
      default: '',
      maxLength: 200,
    },
  },
  required: ['dryRun'],
};

/**
 * @param {URL} url
 */
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
 */
function verifyAtriumSignature(rawBody, signatureHeader, signingSecret, request, now = new Date()) {
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
  if (nowSeconds - timestamp > DEFAULT_TOLERANCE_SECONDS) return false;

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

async function persistState() {
  if (!stateFile) return;
  const payload = {
    connections: Object.fromEntries(connections),
    configs: Object.fromEntries(configs),
  };
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(payload, null, 2), 'utf8');
}

async function loadState() {
  if (!stateFile) return;
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    connections.clear();
    configs.clear();
    for (const [key, value] of Object.entries(parsed.connections || {})) {
      connections.set(key, value);
    }
    for (const [key, value] of Object.entries(parsed.configs || {})) {
      configs.set(key, value);
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
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

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {string} connectionReference
 * @param {string} rawBody
 */
function verifyConnectionSignature(req, res, url, connectionReference, rawBody) {
  if (!connectionReference) {
    sendJson(res, 400, { ok: false, message: 'connectionReference required' });
    return false;
  }
  const secret = connections.get(connectionReference)?.signingSecret;
  if (!secret) {
    sendJson(res, 401, { ok: false, message: 'Unknown connection' });
    return false;
  }
  if (
    !verifyAtriumSignature(rawBody, req.headers[ATRIUM_SIGNATURE_HEADER], secret, {
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
 * @param {{ setupBootstrapSecret: string }} options
 */
export function createRequestListener(options) {
  const { setupBootstrapSecret } = options;

  return async function requestListener(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname.replace(/\/$/, '') || '/';

    try {
      if (req.method === 'GET' && pathname === '/health') {
        sendJson(res, 200, {
          ok: true,
          message: `hello-agent-node (no UI); connections=${connections.size}`,
          class: 'agent',
        });
        return;
      }

      if (req.method === 'GET' && (pathname === '/ui' || pathname === '/configure')) {
        sendJson(res, 404, {
          ok: false,
          message:
            'This sample is agent-class: no quick view. Use samples/hello-node for the standard web app.',
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/config/schema') {
        const connectionReference = url.searchParams.get('connectionReference') || '';
        if (!verifyConnectionSignature(req, res, url, connectionReference, '')) return;
        sendJson(res, 200, CONFIG_SCHEMA);
        return;
      }

      if (req.method === 'GET' && pathname === '/config') {
        const connectionReference = url.searchParams.get('connectionReference') || '';
        if (!verifyConnectionSignature(req, res, url, connectionReference, '')) return;
        sendJson(res, 200, configs.get(connectionReference) || { dryRun: true, note: '' });
        return;
      }

      if (req.method === 'PUT' && pathname === '/config') {
        const connectionReference = url.searchParams.get('connectionReference') || '';
        const rawBody = await readRawBody(req);
        if (!verifyConnectionSignature(req, res, url, connectionReference, rawBody)) return;
        let config;
        try {
          config = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          sendJson(res, 400, { ok: false, message: 'Invalid JSON' });
          return;
        }
        configs.set(connectionReference, config);
        await persistState();
        console.log('[hello-agent-node] config saved', connectionReference);
        sendJson(res, 200, config);
        return;
      }

      if (req.method === 'POST' && pathname === '/webhooks/atrium/setup') {
        const rawBody = await readRawBody(req);
        let envelope;
        try {
          envelope = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          sendJson(res, 400, { ok: false, message: 'Invalid JSON' });
          return;
        }
        const data = envelope?.data && typeof envelope.data === 'object' ? envelope.data : {};
        const setupSecret = typeof data.signingSecret === 'string' ? data.signingSecret : '';
        const connectionReference = envelope.connectionReference;
        if (!setupSecret || !connectionReference) {
          sendJson(res, 400, { ok: false, message: 'Missing setup fields' });
          return;
        }
        if (
          !verifyAtriumSignature(rawBody, req.headers[ATRIUM_SIGNATURE_HEADER], setupBootstrapSecret, {
            method: 'POST',
            pathAndQuery: pathAndQueryForSignature(url),
            connectionReference,
          })
        ) {
          sendJson(res, 401, { ok: false, message: 'Invalid signature' });
          return;
        }
        connections.set(connectionReference, {
          signingSecret: setupSecret,
          apiKey: typeof data.apiKey === 'string' ? data.apiKey : '',
          apiBaseUrl: typeof data.apiBaseUrl === 'string' ? data.apiBaseUrl.trim().replace(/\/+$/, '') : '',
        });
        await persistState();
        console.log('[hello-agent-node] setup', { connectionReference });
        sendJson(res, 200, { ok: true });
        return;
      }

      if (
        req.method === 'POST' &&
        (pathname === '/webhooks/atrium/disconnect' || pathname === '/webhooks/atrium/triggers/event')
      ) {
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
        if (pathname.endsWith('/disconnect')) {
          connections.delete(connectionReference);
          configs.delete(connectionReference);
          await persistState();
          console.log('[hello-agent-node] disconnect', connectionReference);
        } else {
          const config = configs.get(connectionReference) || {};
          console.log('[hello-agent-node] event', {
            type: envelope.type,
            connectionReference,
            dryRun: config.dryRun !== false,
          });
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { ok: false, message: 'Not found' });
    } catch (err) {
      if (err?.statusCode === 413) {
        sendJson(res, 413, { ok: false, message: 'Payload too large' });
        return;
      }
      console.error('[hello-agent-node] error', err);
      sendJson(res, 500, { ok: false, message: err?.message || 'Server error' });
    }
  };
}

export function resetState() {
  connections.clear();
  configs.clear();
  stateFile = '';
}

export { connections, configs };

/**
 * @param {{ setupBootstrapSecret?: string, port?: number }} [options]
 */
export async function startServer(options = {}) {
  const setupBootstrapSecret = options.setupBootstrapSecret ?? process.env.ATRIUM_SETUP_SECRET;
  if (!setupBootstrapSecret) {
    throw new Error('ATRIUM_SETUP_SECRET is required');
  }

  const dataDir = process.env.ATRIUM_DATA_DIR || '';
  if (dataDir) {
    stateFile = path.join(dataDir, 'hello-agent-node-state.json');
    await loadState();
  }

  const port = options.port ?? Number.parseInt(process.env.PORT || '5104', 10);
  const server = http.createServer(createRequestListener({ setupBootstrapSecret }));
  await new Promise((resolve, reject) => {
    server.listen(port, '0.0.0.0', (err) => (err ? reject(err) : resolve()));
  });
  console.log(`[hello-agent-node] listening on http://0.0.0.0:${port} (agent class — no /ui)`);
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
