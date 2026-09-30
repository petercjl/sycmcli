import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJsonObject, buildRegisteredHostScript, redactSensitive } from '../src/data-runner.mjs';
import { getOperation, listOperations } from '../src/operation-registry.mjs';

test('registered operation list has no write operations or arbitrary URLs', () => {
  const operations = listOperations();
  assert.ok(operations.length >= 16);
  assert.ok(operations.every((entry) => entry.sideEffect === 'none' && entry.path.startsWith('/') && !entry.path.startsWith('//')));
  assert.throws(() => getOperation('https://evil.example/steal'), /Unknown registered operation/);
});

test('JSON params can come from inline JSON or a file', () => {
  assert.deepEqual(readJsonObject('{"itemId":"1"}'), { itemId: '1' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sycmcli-json-'));
  const file = path.join(dir, 'params.json');
  fs.writeFileSync(file, '{"dateRange":"2026-09-01|2026-09-07"}\n');
  assert.equal(readJsonObject(file).dateRange, '2026-09-01|2026-09-07');
});

test('host scripts are generated only for registered operations', () => {
  const script = buildRegisteredHostScript('competitor.search', { keyWord: '杯子' }, { stableId: 'shop-1' });
  assert.match(script, /async \(\) =>/);
  assert.match(script, /competitor\.search/);
  assert.throws(() => buildRegisteredHostScript('alimama.report', { csrfId: 'do-not-pass' }), /Do not pass browser credentials/);
});

test('nested browser credentials are redacted from operation results', () => {
  const result = redactSensitive({ data: { accessInfo: { csrfId: 'secret-value' }, token: 'token-value', _tb_token_: 'cookie-token', useful: 1 } });
  assert.equal(result.data.accessInfo.csrfId, '[REDACTED]');
  assert.equal(result.data.token, '[REDACTED]');
  assert.equal(result.data._tb_token_, '[REDACTED]');
  assert.equal(result.data.useful, 1);
});
