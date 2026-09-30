import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { browserAutomationState, browserStatus, managedCdpUrl, parseDevToolsActivePort, storeBrowserLabel, storePageTitle, writeChromeProfileName } from '../src/cdp.mjs';

test('parses Chrome dynamic DevTools endpoint', () => {
  assert.equal(parseDevToolsActivePort('45123\n/devtools/browser/example\n'), 'http://127.0.0.1:45123');
  assert.equal(parseDevToolsActivePort('0\n'), null);
  assert.equal(parseDevToolsActivePort('not-a-port'), null);
});

test('discovers the endpoint only from the selected managed profile', (t) => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sycmcli-profile-'));
  t.after(() => fs.rmSync(profileDir, { recursive: true, force: true }));
  assert.equal(managedCdpUrl({ profileDir }), null);
  fs.writeFileSync(path.join(profileDir, 'DevToolsActivePort'), '45124\n/devtools/browser/owned\n');
  assert.equal(managedCdpUrl({ profileDir }), 'http://127.0.0.1:45124');
});

test('uses a persistent managed port instead of a stale dynamic-port file', (t) => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sycmcli-fixed-port-'));
  t.after(() => fs.rmSync(profileDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(profileDir, 'DevToolsActivePort'), '45124\n/devtools/browser/stale\n');
  assert.equal(managedCdpUrl({ profileDir, port: 19323 }), 'http://127.0.0.1:19323');
});

test('writes a persistent store name without discarding Chrome preferences', (t) => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sycmcli-profile-label-'));
  t.after(() => fs.rmSync(profileDir, { recursive: true, force: true }));
  const defaultDir = path.join(profileDir, 'Default');
  fs.mkdirSync(defaultDir, { recursive: true });
  const preferencesFile = path.join(defaultDir, 'Preferences');
  fs.writeFileSync(preferencesFile, JSON.stringify({ browser: { custom_chrome_frame: true }, profile: { avatar_index: 4 } }));

  const result = writeChromeProfileName({ alias: 'shop-a', displayName: '示例旗舰店', profileDir });
  const preferences = JSON.parse(fs.readFileSync(preferencesFile, 'utf8'));
  assert.equal(result.name, '示例旗舰店');
  assert.equal(preferences.profile.name, '示例旗舰店');
  assert.equal(preferences.profile.using_default_name, false);
  assert.equal(preferences.profile.avatar_index, 4);
  assert.equal(preferences.browser.custom_chrome_frame, true);
});

test('builds visible browser labels from display name and alias', () => {
  assert.equal(storeBrowserLabel({ alias: 'shop-a', displayName: '示例旗舰店' }), '示例旗舰店');
  assert.equal(storeBrowserLabel({ alias: 'shop-a' }), 'shop-a');
  assert.equal(storePageTitle({ alias: 'shop-a' }), '【shop-a】生意参谋');
});

test('detects a headless CDP endpoint as non-interactive', async (t) => {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ Browser: 'HeadlessChrome/154.0.0.0', 'User-Agent': 'Mozilla/5.0 HeadlessChrome/154.0.0.0' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const status = await browserStatus({ mode: 'attached', cdpUrl: `http://127.0.0.1:${address.port}` });
  assert.equal(status.state, 'running');
  assert.equal(status.headless, true);
  assert.equal(status.interactive, false);
});

test('detects the webdriver automation signal through a page target', async (t) => {
  const { WebSocketServer } = await import('ws');
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => wss.once('listening', resolve));
  t.after(() => wss.close());
  wss.on('connection', (socket) => socket.on('message', (chunk) => {
    const message = JSON.parse(chunk.toString());
    socket.send(JSON.stringify({ id: message.id, result: { result: { type: 'boolean', value: true } } }));
  }));
  const wsPort = wss.address().port;
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify([{ type: 'page', webSocketDebuggerUrl: `ws://127.0.0.1:${wsPort}` }]));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  assert.equal(await browserAutomationState(`http://127.0.0.1:${server.address().port}`), true);
});
