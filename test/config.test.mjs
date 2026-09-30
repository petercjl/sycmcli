import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listStores, readStore, setCurrentStore, storeFile, updateStore, writeStore } from '../src/config.mjs';

test('store configuration is isolated, private, and updateable', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sycmcli-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = writeStore('alpha', { mode: 'attached', cdpUrl: 'http://127.0.0.1:9223', createdAt: 'now' }, root);
  assert.equal(store.alias, 'alpha');
  assert.equal(fs.statSync(storeFile('alpha', root)).mode & 0o777, 0o600);
  assert.throws(() => writeStore('alpha', {}, root), /already exists/);
  updateStore('alpha', { identity: { stableId: '123' } }, root);
  assert.equal(readStore('alpha', root).identity.stableId, '123');
  assert.equal(listStores(root).length, 1);
  assert.equal(setCurrentStore('alpha', root), 'alpha');
});

test('store alias cannot escape the config root', () => {
  assert.throws(() => writeStore('../escape', {}), /alias/);
});
