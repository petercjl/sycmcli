import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDateRange } from '../src/sycm.mjs';

test('date range uses T-1 after local cutoff', () => {
  const now = new Date(2026, 8, 30, 12, 0, 0);
  assert.equal(buildDateRange('day', now), '2026-09-29|2026-09-29');
  assert.equal(buildDateRange('recent7', now), '2026-09-23|2026-09-29');
});

test('date range uses T-2 before local cutoff', () => {
  const now = new Date(2026, 8, 30, 7, 0, 0);
  assert.equal(buildDateRange('day', now), '2026-09-28|2026-09-28');
  assert.equal(buildDateRange('recent30', now), '2026-08-30|2026-09-28');
});
