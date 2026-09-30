import childProcess from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { WebSocket } from 'ws';
import { CliError } from './errors.mjs';

const SYCM_URL = 'https://sycm.taobao.com/mc/mq/market_monitor.htm';

function normalizeCdpUrl(value) {
  const url = new URL(value || 'http://127.0.0.1:9223');
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) {
    throw new CliError('UNSAFE_CDP_URL', 'Only loopback CDP endpoints are supported.');
  }
  return url.origin;
}

async function cdpJson(base, route, options = {}) {
  let response;
  try { response = await fetch(`${normalizeCdpUrl(base)}${route}`, options); } catch (error) {
    throw new CliError('BROWSER_UNAVAILABLE', `Cannot reach Chrome DevTools at ${base}.`, { details: error.message, hint: 'Run sycmcli auth login --store <alias> and keep that browser open.' });
  }
  if (!response.ok) throw new CliError('CDP_HTTP_ERROR', `Chrome DevTools returned HTTP ${response.status}.`);
  return response.json();
}

export async function isCdpReady(cdpUrl) {
  try { await cdpJson(cdpUrl, '/json/version'); return true; } catch { return false; }
}

async function waitForPort(port, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(400);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.once('error', () => resolve(false));
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new CliError('BROWSER_START_TIMEOUT', `Chrome did not start on port ${port}.`);
}

function chromeExecutable() {
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(process.env.HOME || '', 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]
    : process.platform === 'win32'
      ? [path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe')]
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!found) throw new CliError('CHROME_NOT_FOUND', 'Google Chrome could not be found.', { hint: 'Install Google Chrome or use an attached store with --cdp-url.' });
  return found;
}

export async function ensureBrowser(store, { openLogin = false } = {}) {
  const cdpUrl = normalizeCdpUrl(store.cdpUrl || `http://127.0.0.1:${store.port}`);
  if (await isCdpReady(cdpUrl)) {
    if (openLogin) await ensureSycmPage(cdpUrl);
    return cdpUrl;
  }
  if (store.mode !== 'managed') {
    throw new CliError('BROWSER_UNAVAILABLE', `Attached Chrome for store "${store.alias}" is not available at ${cdpUrl}.`, { hint: 'Open the configured browser, or change this store to managed mode.' });
  }
  const port = Number(store.port || new URL(cdpUrl).port);
  if (!store.profileDir) throw new CliError('STORE_CONFIG_INVALID', 'Managed stores require profileDir.');
  fs.mkdirSync(store.profileDir, { recursive: true, mode: 0o700 });
  const child = childProcess.spawn(chromeExecutable(), [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${store.profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    SYCM_URL
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  await waitForPort(port);
  if (openLogin) await ensureSycmPage(cdpUrl);
  return cdpUrl;
}

export async function ensureSycmPage(cdpUrl) {
  return ensureServicePage(cdpUrl, { entryUrl: SYCM_URL, hosts: ['sycm.taobao.com'], label: 'Shengyicanmou' });
}

export async function ensureServicePage(cdpUrl, { entryUrl, hosts, matchPath, label = 'service' }) {
  const targets = await cdpJson(cdpUrl, '/json/list');
  const matches = (item) => {
    if (item.type !== 'page') return false;
    try { const url = new URL(item.url); return hosts.includes(url.hostname) && (!matchPath || url.pathname.startsWith(matchPath)); } catch { return false; }
  };
  let target = targets.find(matches);
  let created = false;
  if (!target) {
    try {
      target = await cdpJson(cdpUrl, `/json/new?${encodeURIComponent(entryUrl)}`, { method: 'PUT' });
      created = true;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const refreshed = await cdpJson(cdpUrl, '/json/list');
        const loaded = refreshed.find(matches);
        if (loaded) { target = loaded; break; }
      }
    } catch (error) {
      throw new CliError('SERVICE_PAGE_MISSING', `No ${label} page is open and a new one could not be created.`, { details: error.message, hint: `Open ${entryUrl} in the configured Chrome.` });
    }
  }
  if (created) await new Promise((resolve) => setTimeout(resolve, 500));
  return target;
}

export async function evaluate(cdpUrl, expression, { timeoutMs = 30000, page } = {}) {
  const target = page ? await ensureServicePage(cdpUrl, page) : await ensureSycmPage(cdpUrl);
  if (!target.webSocketDebuggerUrl) throw new CliError('CDP_TARGET_INVALID', 'The Shengyicanmou page has no debuggable WebSocket target.');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const id = 1;
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new CliError('CDP_TIMEOUT', `Browser execution exceeded ${timeoutMs}ms.`));
    }, timeoutMs);
    ws.once('open', () => ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, userGesture: false } })));
    ws.on('message', (chunk) => {
      let message;
      try { message = JSON.parse(chunk.toString()); } catch { return; }
      if (message.id !== id) return;
      clearTimeout(timer);
      ws.close();
      if (message.error) return reject(new CliError('CDP_PROTOCOL_ERROR', message.error.message, { details: message.error.data }));
      if (message.result?.exceptionDetails) {
        const description = message.result.exceptionDetails.exception?.description || message.result.exceptionDetails.text;
        return reject(new CliError('BROWSER_EXECUTION_ERROR', description));
      }
      resolve(message.result?.result?.value);
    });
    ws.once('error', (error) => { clearTimeout(timer); reject(new CliError('CDP_SOCKET_ERROR', error.message)); });
  });
}

export async function browserIdentity(cdpUrl) {
  const expression = `(() => {
    const meta = globalThis.metaCacheData || globalThis.g_config || {};
    const identity = {
      loginUserId: meta.loginUserId ?? null,
      loginUserName: meta.loginUserName ?? null,
      mainUserId: meta.mainUserId ?? null,
      mainUserName: meta.mainUserName ?? null,
      runAsUserId: meta.runAsUserId ?? null,
      runAsUserName: meta.runAsUserName ?? null,
      runAsShopId: meta.runAsShopId ?? null,
      runAsShopTitle: meta.runAsShopTitle ?? null
    };
    return { href: location.href, host: location.host, title: document.title, identity };
  })()`;
  const result = await evaluate(cdpUrl, expression);
  if (result?.host !== 'sycm.taobao.com') throw new CliError('AUTH_REQUIRED', 'The active data page is not on sycm.taobao.com.');
  const identity = result.identity || {};
  const stableId = identity.runAsShopId || identity.runAsUserId || identity.mainUserId || identity.loginUserId;
  if (!stableId) throw new CliError('AUTH_REQUIRED', 'Shengyicanmou login identity is unavailable.', { hint: 'Finish login in the opened Chrome, then rerun auth status.' });
  return { ...identity, stableId: String(stableId), displayName: identity.runAsShopTitle || identity.runAsUserName || identity.mainUserName || identity.loginUserName || null };
}

export async function pageFetch(cdpUrl, request, { timeoutMs = 45000 } = {}) {
  const serialized = JSON.stringify(request);
  const expression = `(async () => {
    const request = ${serialized};
    const allowedHosts = request.hosts || ['sycm.taobao.com'];
    if (!allowedHosts.includes(location.host)) return { __sycmcliError: { code: 'AUTH_REQUIRED', message: 'The active page is not on an authorized service host.' } };
    const meta = globalThis.metaCacheData || globalThis.g_config || {};
    const token = meta.legalityToken || meta.token || new URLSearchParams(location.search).get('token') || '';
    const payload = { ...(request.params || {}) };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(request.params || {})) {
      if (value !== undefined && value !== null) params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    if ((request.tokenStrategy || 'sycm-meta') === 'sycm-meta' && request.useToken !== false && token) {
      params.set('_', String(Date.now()));
      params.set('token', token);
    }
    if (request.tokenStrategy === 'dmp-magix') {
      const startedAt = Date.now();
      let dmpToken = ''; let csrfId = '';
      while (Date.now() - startedAt < 20000 && (!dmpToken || !csrfId)) {
        dmpToken = ((document.cookie.split(/\s*;\s*/).find((value) => value.startsWith('_tb_token_=')) || '').slice(11));
        let Magix = globalThis.Magix;
        try {
          if (!Magix?.config && globalThis.seajs?.cache) for (const item of Object.values(globalThis.seajs.cache)) { const candidate = item?.exports?.default || item?.exports; if (candidate?.config) { Magix = candidate; break; } }
        } catch {}
        const user = Magix?.config?.('dmp-new.user') || Magix?.config?.('mx.user') || {};
        csrfId = user.csrfId || user.accessInfo?.csrfId || '';
        if (!dmpToken || !csrfId) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!dmpToken || !csrfId) return { __sycmcliError: { code: 'AUTH_REQUIRED', message: !dmpToken ? 'DMP login token is unavailable.' : 'DMP CSRF context is unavailable.' } };
      params.set('bizCode', 'dmp'); params.set('_tb_token_', dmpToken); params.set('_csrf', csrfId); params.set('csrfId', csrfId);
    }
    if (request.tokenStrategy === 'taobao-cookie') {
      const taobaoToken = globalThis._tb_token_ || globalThis.window?._tb_token_ || ((document.cookie.match(/(?:^|;\s*)_tb_token_=([^;]+)/) || [])[1]) || '';
      if (!taobaoToken) return { __sycmcliError: { code: 'AUTH_REQUIRED', message: 'Taobao seller login token is unavailable.' } };
      params.set('_tb_token_', taobaoToken);
    }
    await new Promise((resolve) => setTimeout(resolve, 350 + Math.floor(Math.random() * 650)));
    let url = (request.origin || '') + request.path;
    const method = request.method || 'GET';
    const headers = { Accept: 'application/json, text/plain, */*', ...(request.headers || {}) };
    let body;
    if (method === 'GET') url += params.size ? '?' + params.toString() : '';
    else {
      if (request.encoding === 'json') {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        body = request.rawBody !== undefined ? request.rawBody : JSON.stringify(payload);
      } else {
        headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded;charset=UTF-8';
        body = request.rawBody !== undefined ? request.rawBody : params.toString();
      }
    }
    if (request.tokenStrategy === 'alimama-access' && request.path !== '/member/checkAccess.json') {
      let accessResponse;
      try {
        accessResponse = await fetch('/member/checkAccess.json', { method: 'POST', credentials: 'include', headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' }, body: JSON.stringify({ bizCode: 'universalBP' }) });
        const access = await accessResponse.json();
        const accessData = access?.data || access?.result || access;
        const accessInfo = accessData?.accessInfo || accessData;
        const csrfId = accessInfo?.csrfId || accessInfo?.csrfID;
        const loginPointId = accessData?.loginPointId;
        if (csrfId && !params.has('csrfId')) params.set('csrfId', String(csrfId));
        if (loginPointId && !params.has('loginPointId')) params.set('loginPointId', String(loginPointId));
        if (csrfId && payload.csrfId === undefined) payload.csrfId = String(csrfId);
        if (loginPointId && payload.loginPointId === undefined) payload.loginPointId = String(loginPointId);
        if (method !== 'GET' && request.rawBody === undefined) body = request.encoding === 'json' ? JSON.stringify(payload) : params.toString();
      } catch (error) {
        return { __sycmcliError: { code: 'AUTH_REQUIRED', message: 'Alimama access check failed: ' + String(error && error.message || error) } };
      }
    }
    const controller = new AbortController();
    const requestTimeoutMs = request.requestTimeoutMs || 20000;
    let response;
    try {
      response = await Promise.race([
        fetch(url, { method, credentials: 'include', headers, ...(body !== undefined ? { body } : {}), signal: controller.signal }),
        new Promise((resolve) => setTimeout(() => { controller.abort(); resolve({ __sycmcliTimeout: true }); }, requestTimeoutMs))
      ]);
    } catch (error) {
      return { __sycmcliError: { code: error && error.name === 'AbortError' ? 'SYCM_REQUEST_TIMEOUT' : 'SYCM_NETWORK_ERROR', message: error && error.name === 'AbortError' ? 'SYCM request timed out.' : String(error && error.message || error) } };
    }
    if (response && response.__sycmcliTimeout) return { __sycmcliError: { code: 'SYCM_REQUEST_TIMEOUT', message: 'SYCM request timed out.' } };
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    if (!response.ok) return { __sycmcliError: { code: response.status === 401 || response.status === 403 ? 'AUTH_OR_RISK_CHALLENGE' : 'SERVICE_HTTP_ERROR', message: 'Service returned HTTP ' + response.status, status: response.status } };
    if (!contentType.includes('json') && /login|登录|验证码|滑块|安全验证|punish/i.test(text)) return { __sycmcliError: { code: 'AUTH_OR_RISK_CHALLENGE', message: 'SYCM requested login or risk verification.' } };
    let responseBody;
    try { responseBody = JSON.parse(text); } catch { return { __sycmcliError: { code: 'SERVICE_INVALID_RESPONSE', message: 'Service did not return JSON.' } }; }
    if (responseBody && responseBody.code !== undefined && ![0, 200, '0', '200'].includes(responseBody.code)) {
      const message = responseBody.message || responseBody.msg || ('Service API code=' + responseBody.code);
      const risk = /login|登录|验证码|滑块|安全|权限|token|会话|过期/i.test(message);
      return { __sycmcliError: { code: risk ? 'AUTH_OR_RISK_CHALLENGE' : 'SERVICE_API_ERROR', message, apiCode: responseBody.code } };
    }
    if (responseBody?.info?.ok === false || responseBody?.success === false) {
      const message = responseBody?.info?.message || responseBody?.message || 'Service reported an unsuccessful response.';
      const risk = /login|登录|验证码|滑块|安全|权限|token|会话|过期/i.test(message);
      return { __sycmcliError: { code: risk ? 'AUTH_OR_RISK_CHALLENGE' : 'SERVICE_API_ERROR', message, apiCode: responseBody?.info?.errorCode ?? responseBody?.code } };
    }
    return responseBody;
  })()`;
  const page = request.entryUrl ? { entryUrl: request.entryUrl, hosts: request.hosts, matchPath: request.matchPath, label: request.service || 'service' } : undefined;
  const result = await evaluate(cdpUrl, expression, { timeoutMs, page });
  if (result?.__sycmcliError) {
    const { code, message, ...details } = result.__sycmcliError;
    throw new CliError(code, message, { details, hint: code === 'AUTH_OR_RISK_CHALLENGE' ? 'Complete verification in the configured Chrome; sycmcli will not bypass it.' : undefined });
  }
  return result;
}
