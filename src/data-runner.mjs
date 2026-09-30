import fs from 'node:fs';
import path from 'node:path';
import { CliError, invariant } from './errors.mjs';
import { getOperation, getService, validateOperationParams } from './operation-registry.mjs';
import { pageFetch } from './cdp.mjs';

const SENSITIVE_KEY = /^(?:_?csrf(?:id)?|_?tb_token_|token|accessToken|refreshToken|cookie|cookies|authorization|password|passwd|secret|session(?:id)?|legalityToken)$/i;

export function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSensitive(entry)]));
}

function assertNoCredentialParams(value, pathPrefix = 'params') {
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) throw new CliError('CREDENTIAL_INPUT_FORBIDDEN', `Do not pass browser credentials in ${pathPrefix}.${key}; sycmcli resolves authentication inside the selected browser.`, { exitCode: 2 });
    assertNoCredentialParams(entry, `${pathPrefix}.${key}`);
  }
}

export function readJsonObject(value, { cwd = process.cwd() } = {}) {
  invariant(value !== undefined && value !== true && value !== '', 'MISSING_ARGUMENT', 'Pass --params-json with a JSON object or JSON file path.', { exitCode: 2 });
  const input = String(value);
  let text = input;
  if (!input.trimStart().startsWith('{')) {
    const file = path.resolve(cwd, input);
    if (!fs.existsSync(file)) throw new CliError('INPUT_FILE_NOT_FOUND', `JSON input file does not exist: ${file}`, { exitCode: 2 });
    text = fs.readFileSync(file, 'utf8');
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch (error) { throw new CliError('INVALID_JSON', 'The supplied JSON is invalid.', { details: error.message, exitCode: 2 }); }
  invariant(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'INVALID_ARGUMENT', 'JSON input must be an object.', { exitCode: 2 });
  return parsed;
}

export async function runRegisteredOperation(cdpUrl, id, params) {
  const operation = getOperation(id);
  const service = getService(operation.service);
  validateOperationParams(operation, params);
  assertNoCredentialParams(params);
  const effectiveParams = { ...(operation.defaultParams || {}), ...params };
  const body = await pageFetch(cdpUrl, {
    service: operation.service,
    entryUrl: service.entryUrl,
    hosts: service.hosts,
    matchPath: service.matchPath,
    tokenStrategy: service.tokenStrategy,
    origin: service.origin,
    method: operation.method,
    path: operation.path,
    params: effectiveParams,
    encoding: operation.encoding
  });
  return { operation: id, service: operation.service, response: redactSensitive(body) };
}

export function buildRegisteredHostScript(id, params, expectedIdentity = null) {
  const operation = getOperation(id);
  const service = getService(operation.service);
  validateOperationParams(operation, params);
  assertNoCredentialParams(params);
  const task = JSON.stringify({ operation, service, params: { ...(operation.defaultParams || {}), ...params }, expectedIdentity });
  return `async () => (${registeredHostTask.toString()})(${task})`;
}

async function registeredHostTask(task) {
  try {
    const sensitiveKey = /^(?:_?csrf(?:id)?|_?tb_token_|token|accessToken|refreshToken|cookie|cookies|authorization|password|passwd|secret|session(?:id)?|legalityToken)$/i;
    const redact = (value) => Array.isArray(value) ? value.map(redact) : (!value || typeof value !== 'object' ? value : Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : redact(entry)])));
    if (!task.service.hosts.includes(location.host)) throw Object.assign(new Error(`Open and log in to ${task.service.entryUrl} first.`), { code: 'AUTH_REQUIRED' });
    const payload = { ...(task.params || {}) };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(task.params || {})) if (value !== undefined && value !== null) params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    const meta = globalThis.metaCacheData || globalThis.g_config || {};
    if (task.service.tokenStrategy === 'sycm-meta') {
      const token = meta.legalityToken || meta.token || new URLSearchParams(location.search).get('token') || '';
      if (token) { params.set('_', String(Date.now())); params.set('token', token); }
    }
    if (task.service.tokenStrategy === 'dmp-magix') {
      const startedAt = Date.now(); let dmpToken = ''; let csrfId = '';
      while (Date.now() - startedAt < 20000 && (!dmpToken || !csrfId)) {
        dmpToken = ((document.cookie.split(/\s*;\s*/).find((value) => value.startsWith('_tb_token_=')) || '').slice(11));
        let Magix = globalThis.Magix;
        try { if (!Magix?.config && globalThis.seajs?.cache) for (const item of Object.values(globalThis.seajs.cache)) { const candidate = item?.exports?.default || item?.exports; if (candidate?.config) { Magix = candidate; break; } } } catch {}
        const user = Magix?.config?.('dmp-new.user') || Magix?.config?.('mx.user') || {};
        csrfId = user.csrfId || user.accessInfo?.csrfId || '';
        if (!dmpToken || !csrfId) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!dmpToken || !csrfId) throw Object.assign(new Error(!dmpToken ? 'DMP login token is unavailable.' : 'DMP CSRF context is unavailable.'), { code: 'AUTH_REQUIRED' });
      params.set('bizCode', 'dmp'); params.set('_tb_token_', dmpToken); params.set('_csrf', csrfId); params.set('csrfId', csrfId);
    }
    if (task.service.tokenStrategy === 'taobao-cookie') {
      const taobaoToken = globalThis._tb_token_ || globalThis.window?._tb_token_ || ((document.cookie.match(/(?:^|;\s*)_tb_token_=([^;]+)/) || [])[1]) || '';
      if (!taobaoToken) throw Object.assign(new Error('Taobao seller login token is unavailable.'), { code: 'AUTH_REQUIRED' });
      params.set('_tb_token_', taobaoToken);
    }
    if (task.service.tokenStrategy === 'alimama-access' && task.operation.path !== '/member/checkAccess.json') {
      const accessResponse = await fetch('/member/checkAccess.json', { method: 'POST', credentials: 'include', headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' }, body: JSON.stringify({ bizCode: 'universalBP' }) });
      const access = await accessResponse.json();
      const accessData = access?.data || access?.result || access;
      const accessInfo = accessData?.accessInfo || accessData;
      const csrfId = accessInfo?.csrfId || accessInfo?.csrfID;
      const loginPointId = accessData?.loginPointId;
      if (csrfId) params.set('csrfId', String(csrfId));
      if (loginPointId) params.set('loginPointId', String(loginPointId));
      if (csrfId && payload.csrfId === undefined) payload.csrfId = String(csrfId);
      if (loginPointId && payload.loginPointId === undefined) payload.loginPointId = String(loginPointId);
    }
    const method = task.operation.method || 'GET';
    const headers = { Accept: 'application/json, text/plain, */*' };
    let url = task.service.origin + task.operation.path;
    const init = { method, credentials: 'include', headers };
    if (method === 'GET') url += params.size ? `?${params}` : '';
    else if (task.operation.encoding === 'json') { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(payload); }
    else { headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8'; init.body = params.toString(); }
    const response = await fetch(url, init);
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error(`Service returned HTTP ${response.status}`), { code: [401, 403].includes(response.status) ? 'AUTH_OR_RISK_CHALLENGE' : 'SERVICE_HTTP_ERROR' });
    let body;
    try { body = JSON.parse(text); } catch { throw Object.assign(new Error('Service did not return JSON.'), { code: 'SERVICE_INVALID_RESPONSE' }); }
    if (body?.code !== undefined && ![0, 200, '0', '200'].includes(body.code)) throw Object.assign(new Error(body.message || body.msg || `Service API code=${body.code}`), { code: 'SERVICE_API_ERROR' });
    if (body?.info?.ok === false || body?.success === false) throw Object.assign(new Error(body?.info?.message || body?.message || 'Service reported an unsuccessful response.'), { code: 'SERVICE_API_ERROR' });
    const liveIdentity = {
      stableId: String(meta.runAsShopId || meta.runAsUserId || meta.mainUserId || meta.loginUserId || task.expectedIdentity?.stableId || ''),
      displayName: meta.runAsShopTitle || meta.runAsUserName || meta.mainUserName || meta.loginUserName || task.expectedIdentity?.displayName || null
    };
    if (!liveIdentity.stableId) throw Object.assign(new Error('Store identity is not available. Run a Shengyicanmou read first to bind this profile.'), { code: 'AUTH_REQUIRED' });
    return { ok: true, identity: liveIdentity, data: { operation: task.operation.id, service: task.operation.service, response: redact(body) } };
  } catch (error) {
    return { ok: false, error: { code: error?.code || 'HOST_BROWSER_FAILED', message: error?.message || String(error) } };
  }
}
