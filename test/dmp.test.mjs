import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDmpOptions, runDmpShopRead } from '../src/dmp.mjs';

test('DMP options enforce service period and pagination limits', () => {
  assert.deepEqual(normalizeDmpOptions('overview', {}), { period: '7', benchmark: '0' });
  assert.deepEqual(normalizeDmpOptions('items', { period: 30, page: 2, pageSize: 100 }), { period: '30', page: 2, pageSize: 100 });
  assert.throws(() => normalizeDmpOptions('overview', { period: 14 }), /period must be 1, 7, or 30/);
  assert.throws(() => normalizeDmpOptions('items', { pageSize: 101 }), /page-size must be an integer from 1 to 100/);
});

test('DMP dated reads first resolve the live maxDate', async () => {
  const calls = [];
  const runner = async (_cdpUrl, operation, params) => {
    calls.push({ operation, params });
    if (operation === 'dmp.shop-date-range') return { response: { data: { minDate: '2026-01-01', maxDate: '2026-10-11' } } };
    return { response: { data: { pager: { total: 1 }, list: [{ itemId: '1' }] } } };
  };
  const result = await runDmpShopRead('http://127.0.0.1:9555', 'items', { period: 7 }, { runner });
  assert.deepEqual(calls.map((entry) => entry.operation), ['dmp.shop-date-range', 'dmp.shop-items']);
  assert.equal(calls[1].params.endDate, '2026-10-11');
  assert.equal(calls[1].params.period, '7');
  assert.equal(result.items.length, 1);
  assert.equal(result.dateRange.maxDate, '2026-10-11');
});

test('DMP missing values remain null or empty instead of invented zeroes', async () => {
  const runner = async (_cdpUrl, operation) => operation === 'dmp.shop-date-range'
    ? { response: { data: { minDate: '2026-01-01', maxDate: '2026-10-11' } } }
    : { response: { data: null } };
  const result = await runDmpShopRead('http://127.0.0.1:9555', 'overview', {}, { runner });
  assert.equal(result.overview, null);
  assert.equal(JSON.stringify(result).includes(':0'), false);
});
