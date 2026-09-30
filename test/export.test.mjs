import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeOutput } from '../src/export.mjs';

test('exports JSON and refuses an implicit overwrite', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sycmcli-export-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'result.json');
  const info = await writeOutput({ items: [{ rank: 1, title: 'test' }] }, file);
  assert.equal(info.format, 'json');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).items[0].rank, 1);
  await assert.rejects(() => writeOutput({}, file), /already exists/);
});

test('exports CSV and XLSX', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sycmcli-sheet-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = { items: [{ rank: 1, title: '奶锅, 18cm' }] };
  const csv = await writeOutput(data, path.join(root, 'result.csv'));
  const xlsx = await writeOutput(data, path.join(root, 'result.xlsx'));
  assert.ok(csv.bytes > 0);
  assert.ok(xlsx.bytes > 0);
});
