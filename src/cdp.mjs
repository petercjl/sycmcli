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
  const targets = await cdpJson(cdpUrl, '/json/list');
  let target = targets.find((item) => item.type === 'page' && /^https:\/\/sycm\.taobao\.com\//.test(item.url));
  if (!target) {
    try {
      target = await cdpJson(cdpUrl, `/json/new?${encodeURIComponent(SYCM_URL)}`, { method: 'PUT' });
    } catch (error) {
      throw new CliError('SYCM_PAGE_MISSING', 'No Shengyicanmou page is open and a new one could not be created.', { details: error.message, hint: `Open ${SYCM_URL} in the configured Chrome.` });
    }
  }
  return target;
}

export async function evaluate(cdpUrl, expression, { timeoutMs = 30000 } = {}) {
  const target = await ensureSycmPage(cdpUrl);
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
    if (location.host !== 'sycm.taobao.com') return { __sycmcliError: { code: 'AUTH_REQUIRED', message: 'The data page is not on sycm.taobao.com.' } };
    const meta = globalThis.metaCacheData || globalThis.g_config || {};
    const token = meta.legalityToken || meta.token || new URLSearchParams(location.search).get('token') || '';
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(request.params || {})) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    if (request.useToken !== false && token) {
      params.set('_', String(Date.now()));
      params.set('token', token);
    }
    await new Promise((resolve) => setTimeout(resolve, 350 + Math.floor(Math.random() * 650)));
    const url = request.path + (params.size ? '?' + params.toString() : '');
    const controller = new AbortController();
    const requestTimeoutMs = request.requestTimeoutMs || 20000;
    let response;
    try {
      response = await Promise.race([
        fetch(url, { credentials: 'include', headers: { Accept: 'application/json, text/plain, */*' }, signal: controller.signal }),
        new Promise((resolve) => setTimeout(() => { controller.abort(); resolve({ __sycmcliTimeout: true }); }, requestTimeoutMs))
      ]);
    } catch (error) {
      return { __sycmcliError: { code: error && error.name === 'AbortError' ? 'SYCM_REQUEST_TIMEOUT' : 'SYCM_NETWORK_ERROR', message: error && error.name === 'AbortError' ? 'SYCM request timed out.' : String(error && error.message || error) } };
    }
    if (response && response.__sycmcliTimeout) return { __sycmcliError: { code: 'SYCM_REQUEST_TIMEOUT', message: 'SYCM request timed out.' } };
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    if (!response.ok) return { __sycmcliError: { code: response.status === 401 || response.status === 403 ? 'AUTH_OR_RISK_CHALLENGE' : 'SYCM_HTTP_ERROR', message: 'SYCM returned HTTP ' + response.status, status: response.status } };
    if (!contentType.includes('json') && /login|登录|验证码|滑块|安全验证|punish/i.test(text)) return { __sycmcliError: { code: 'AUTH_OR_RISK_CHALLENGE', message: 'SYCM requested login or risk verification.' } };
    let body;
    try { body = JSON.parse(text); } catch { return { __sycmcliError: { code: 'SYCM_INVALID_RESPONSE', message: 'SYCM did not return JSON.' } }; }
    if (body && body.code !== undefined && Number(body.code) !== 0) {
      const message = body.message || body.msg || ('SYCM API code=' + body.code);
      const risk = /login|登录|验证码|滑块|安全|权限|token|会话|过期/i.test(message);
      return { __sycmcliError: { code: risk ? 'AUTH_OR_RISK_CHALLENGE' : 'SYCM_API_ERROR', message, apiCode: body.code } };
    }
    return body;
  })()`;
  const result = await evaluate(cdpUrl, expression, { timeoutMs });
  if (result?.__sycmcliError) {
    const { code, message, ...details } = result.__sycmcliError;
    throw new CliError(code, message, { details, hint: code === 'AUTH_OR_RISK_CHALLENGE' ? 'Complete verification in the configured Chrome; sycmcli will not bypass it.' : undefined });
  }
  return result;
}
