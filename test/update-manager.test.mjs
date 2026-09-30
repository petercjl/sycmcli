import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compareVersions, readUpdateState, writeUpdateState } from '../src/update-manager.mjs';

test('compares release versions', () => {
  assert.equal(compareVersions('0.2.0', '0.1.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('2.0.0', '2.1.0'), -1);
});

test('update state defaults to automatic daily checks and persists settings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sycmcli-update-'));
  assert.equal(readUpdateState(root).autoUpdate, true);
  assert.equal(readUpdateState(root).intervalHours, 24);
  const next = writeUpdateState({ autoUpdate: false, intervalHours: 12 }, root);
  assert.equal(next.autoUpdate, false);
  assert.equal(readUpdateState(root).intervalHours, 12);
  assert.equal(fs.statSync(path.join(root, 'update.json')).mode & 0o777, 0o600);
});
