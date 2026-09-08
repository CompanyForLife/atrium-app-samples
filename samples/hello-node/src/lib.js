/** Shared hello-node helpers (stdlib only). */

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';

export const ATRIUM_SIGNATURE_HEADER = 'x-atrium-signature';
export const DEFAULT_TOLERANCE_SECONDS = 300;
export const MAX_FUTURE_SKEW_SECONDS = 30;
export const MAX_BODY_BYTES = 1024 * 1024;
export const QUICK_VIEW_PATH = '/ui';
export const EXTERNAL_CONFIG_PATH = '/configure';
export const CONVERSATIONS_PROBE_PATH = '/v1.1/public/conversations?count=1';
export const SETTLEMENTS_PROBE_PATH = '/v1.1/public/finance/settlements?page=1&pageSize=1';

/** @typedef {{ signingSecret: string, apiKey: string, apiBaseUrl: string }} ConnectionState */
/** @typedef {{ capability: string, path: string, status: number, ok: boolean, error?: string }} ProbeResult */

/** @type {Map<string, ConnectionState>} */
export const connections = new Map();
/** @type {Map<string, Record<string, unknown>>} */
export const configs = new Map();

/** @type {string} */
export let stateFile = '';

/** @type {(url: string, init?: RequestInit) => Promise<Response>} */
export let outboundFetch = globalThis.fetch.bind(globalThis);

export const CONFIG_SCHEMA = {
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

export function setStateFile(filePath) {
  stateFile = filePath || '';
}

export function setOutboundFetch(fetchImpl) {
  outboundFetch = fetchImpl;
}

export function resetState() {
  connections.clear();
  configs.clear();
  stateFile = '';
  outboundFetch = globalThis.fetch.bind(globalThis);
}

/**
 * @param {URL} url
 */
export function pathAndQueryForSignature(url) {
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
export function verifyAtriumSignature(
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
 * @param {string} connectionReference
 * @returns {ConnectionState | undefined}
 */
export function loadConnection(connectionReference) {
  const state = connections.get(connectionReference);
  if (!state?.signingSecret) return undefined;
  return state;
}

/**
 * @param {string} connectionReference
 * @returns {string | undefined}
 */
export function loadSecret(connectionReference) {
  return loadConnection(connectionReference)?.signingSecret;
}

export function sanitizeFrameAncestors(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return "'none'";
  for (const character of trimmed) {
    const code = character.codePointAt(0) ?? 0;
    const isAlphaNumeric =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122);
    const isPunctuation = " '*.:/-_".includes(character);
    if (!isAlphaNumeric && !isPunctuation) {
      return "'none'";
    }
  }
  return trimmed;
}

export function parentOrigin() {
  const raw = process.env.ATRIUM_PARENT_ORIGIN || 'http://localhost:4200';
  try {
    const parsed = new URL(raw);
    // Match Go: scheme + host only (URL parser normalises empty path to "/").
    const hasExtraPath = parsed.pathname !== '/' && parsed.pathname !== '';
    if (
      hasExtraPath ||
      parsed.search ||
      parsed.hash ||
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      !parsed.host
    ) {
      return 'http://localhost:4200';
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'http://localhost:4200';
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {string} greeting
 * @param {string} allowedParentOrigin
 * @param {ProbeResult[]} probes
 */
export function quickViewHtml(greeting, allowedParentOrigin, probes) {
  const parentOriginJson = JSON.stringify(allowedParentOrigin);
  const probeRows = probes
    .map((probe) => {
      const statusLabel = probe.status > 0 ? String(probe.status) : 'n/a';
      const detail = probe.error ? probe.error : statusLabel;
      const outcome = probe.ok ? 'ok' : 'fail';
      return (
        `<li><strong>${escapeHtml(probe.capability)}</strong> <code>${escapeHtml(probe.path)}</code>` +
        ` — <span class="probe-${outcome}">${escapeHtml(detail)}</span></li>`
      );
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hello from Node</title>
  <style>
    body { background: #eef2ff; color: #1e1b4b; font-family: system-ui, sans-serif; margin: 0; padding: 2rem; }
    main { margin: auto; max-width: 42rem; }
    .language { color: #4338ca; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    button { background: #1e1b4b; border: 0; border-radius: .35rem; color: white; cursor: pointer; padding: .7rem 1rem; }
    .probes { background: #fff; border: 1px solid #c7d2fe; border-radius: .5rem; margin: 1.5rem 0; padding: 1rem 1.25rem; }
    .probes ul { margin: .5rem 0 0; padding-left: 1.2rem; }
    .probes li { margin: .4rem 0; }
    code { font-size: .85em; }
    .probe-ok { color: #4338ca; font-weight: 600; }
    .probe-fail { color: #9b2226; font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <p class="language">Node sample app</p>
    <h1>${escapeHtml(greeting)}</h1>
    <p>This iframe is rendered by the hosted Node process, not by COHO or Go.</p>
    <section class="probes">
      <h2>Public API capability probes</h2>
      <p>Harmless GETs used to demonstrate capability approval. Granted scopes should return 2xx; newly requested scopes return 403 until approved.</p>
      <ul>${probeRows}</ul>
    </section>
    <button type="button" id="close">Close quick view</button>
  </main>
  <script>
    document.getElementById('close').addEventListener('click', function () {
      parent.postMessage({ type: 'atrium.quickView.close' }, ${parentOriginJson});
    });
  </script>
</body>
</html>`;
}

export function externalConfigHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hello Node configuration</title>
  <style>
    body { background: #0d1b2a; color: #e0fbfc; font-family: system-ui, sans-serif; margin: 0; padding: 2rem; }
    main { margin: auto; max-width: 42rem; }
    code { color: #98c1d9; }
  </style>
</head>
<body>
  <main>
    <h1>Hello Node configuration</h1>
    <p>This is the app-owned external configuration surface opened in a new tab.</p>
    <p>The sample keeps organisation settings in COHO's native JSON Schema form. A production app could authenticate its own users here and offer richer settings.</p>
    <p>Runtime: <code>Node http</code>.</p>
  </main>
</body>
</html>`;
}

export async function loadState() {
  if (!stateFile) return;
  let data;
  try {
    data = await fsPromises.readFile(stateFile, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }

  const state = JSON.parse(data);
  const persistedConnections = state.connections || {};
  for (const [reference, connection] of Object.entries(persistedConnections)) {
    if (!connection?.signingSecret) continue;
    connections.set(reference, {
      signingSecret: connection.signingSecret,
      apiKey: connection.apiKey || '',
      apiBaseUrl: String(connection.apiBaseUrl || '').trim().replace(/\/+$/, ''),
    });
  }

  // Legacy state files only stored signing secrets.
  const legacySecrets = state.secrets || {};
  for (const [reference, secret] of Object.entries(legacySecrets)) {
    if (!secret || connections.has(reference)) continue;
    connections.set(reference, {
      signingSecret: secret,
      apiKey: '',
      apiBaseUrl: '',
    });
  }

  const persistedConfigs = state.configs || {};
  for (const [reference, config] of Object.entries(persistedConfigs)) {
    configs.set(reference, config);
  }
}

async function persistStateLocked() {
  if (!stateFile) return;

  /** @type {{ connections: Record<string, { signingSecret: string, apiKey?: string, apiBaseUrl?: string }>, configs: Record<string, Record<string, unknown>> }} */
  const state = { connections: {}, configs: {} };
  for (const [reference, connection] of connections.entries()) {
    if (!connection.signingSecret) continue;
    state.connections[reference] = {
      signingSecret: connection.signingSecret,
      ...(connection.apiKey ? { apiKey: connection.apiKey } : {}),
      ...(connection.apiBaseUrl ? { apiBaseUrl: connection.apiBaseUrl } : {}),
    };
  }
  for (const [reference, config] of configs.entries()) {
    state.configs[reference] = config;
  }

  const data = JSON.stringify(state);
  const tempFile = `${stateFile}.tmp`;
  await fsPromises.writeFile(tempFile, data, { mode: 0o600 });
  await fsPromises.rename(tempFile, stateFile);
  // Ensure mode after rename (umask / platforms that ignore writeFile mode).
  await fsPromises.chmod(stateFile, 0o600);
}

/** Serialize persists so concurrent requests do not clobber state. */
let persistQueue = Promise.resolve();

export function persistState() {
  const run = persistQueue.then(() => persistStateLocked());
  persistQueue = run.catch(() => {});
  return run;
}

/**
 * @param {string} connectionReference
 * @param {ConnectionState} state
 */
export async function storeConnectionState(connectionReference, state) {
  connections.set(connectionReference, state);
  configs.set(connectionReference, { greeting: 'Hello from Atrium' });
  await persistState();
}

/**
 * @param {string} connectionReference
 */
export async function deleteConnectionState(connectionReference) {
  connections.delete(connectionReference);
  configs.delete(connectionReference);
  await persistState();
}

/**
 * @param {string} connectionReference
 * @param {Record<string, unknown>} config
 */
export async function storeConfigState(connectionReference, config) {
  configs.set(connectionReference, config);
  await persistState();
}

/**
 * @param {string} apiBaseUrl
 * @param {string} apiKey
 * @param {string} capability
 * @param {string} probePath
 * @returns {Promise<ProbeResult>}
 */
export async function probePublicAPI(apiBaseUrl, apiKey, capability, probePath) {
  /** @type {ProbeResult} */
  const result = {
    capability,
    path: probePath,
    status: 0,
    ok: false,
  };

  try {
    const response = await outboundFetch(`${apiBaseUrl}${probePath}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });
    // Drain a bounded amount of the body.
    try {
      await response.arrayBuffer();
    } catch {
      // ignore body read errors
    }
    result.status = response.status;
    result.ok = response.status >= 200 && response.status < 300;
  } catch {
    result.error = 'request failed';
  }
  return result;
}

/**
 * @param {string} connectionReference
 * @returns {Promise<ProbeResult[]>}
 */
export async function runPublicAPIProbes(connectionReference) {
  const state = loadConnection(connectionReference);
  if (!state) {
    return [
      { capability: 'conversations', path: CONVERSATIONS_PROBE_PATH, status: 0, ok: false, error: 'unknown connection' },
      { capability: 'settlements', path: SETTLEMENTS_PROBE_PATH, status: 0, ok: false, error: 'unknown connection' },
    ];
  }
  if (!state.apiBaseUrl || !state.apiKey) {
    return [
      { capability: 'conversations', path: CONVERSATIONS_PROBE_PATH, status: 0, ok: false, error: 'api credentials missing' },
      { capability: 'settlements', path: SETTLEMENTS_PROBE_PATH, status: 0, ok: false, error: 'api credentials missing' },
    ];
  }

  return Promise.all([
    probePublicAPI(state.apiBaseUrl, state.apiKey, 'conversations', CONVERSATIONS_PROBE_PATH),
    probePublicAPI(state.apiBaseUrl, state.apiKey, 'settlements', SETTLEMENTS_PROBE_PATH),
  ]);
}

/**
 * Ensure data directory exists and set state file path (sync, for startup).
 * @param {string} dataDir
 */
export function configureDataDir(dataDir) {
  fs.mkdirSync(dataDir, { mode: 0o750, recursive: true });
  stateFile = path.join(dataDir, 'hello-node-state.json');
}
