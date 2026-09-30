import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { managedCdpUrl, parseDevToolsActivePort } from '../src/cdp.mjs';

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
