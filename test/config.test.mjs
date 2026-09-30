import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { allocateManagedPort, ensureManagedPort, listStores, managedProfileDir, readStore, setCurrentStore, storeFile, updateStore, writeStore } from '../src/config.mjs';

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

test('managed profile location is per-store and uses local app data on Windows', () => {
  assert.equal(managedProfileDir('shop-a', '/config', {}, 'linux'), path.join('/config', 'stores', 'shop-a', 'chrome-profile'));
  assert.equal(managedProfileDir('shop-a', 'C:\\config', { LOCALAPPDATA: 'C:\\Local' }, 'win32'), path.join('C:\\Local', 'sycmcli', 'stores', 'shop-a', 'chrome-profile'));
});

test('assigns a stable unique nonzero port to each managed store', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sycmcli-ports-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const firstPort = allocateManagedPort('shop-a', root);
  writeStore('shop-a', { mode: 'managed', port: firstPort, profileDir: managedProfileDir('shop-a', root, {}, 'linux') }, root);
  const secondPort = allocateManagedPort('shop-b', root);
  assert.ok(firstPort >= 19000 && firstPort <= 19999);
  assert.ok(secondPort >= 19000 && secondPort <= 19999);
  assert.notEqual(secondPort, firstPort);
  assert.equal(allocateManagedPort('shop-a', root), firstPort);
});

test('migrates an older managed store by persisting its assigned port', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sycmcli-port-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacy = writeStore('legacy', { mode: 'managed', profileDir: managedProfileDir('legacy', root, {}, 'linux') }, root);
  const migrated = ensureManagedPort(legacy, root);
  assert.ok(Number.isInteger(migrated.port));
  assert.equal(readStore('legacy', root).port, migrated.port);
  assert.equal(readStore('legacy', root).schemaVersion, 2);
});
