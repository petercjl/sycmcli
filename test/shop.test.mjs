import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShopCategories, normalizeShopItem, normalizeShopSummary, normalizeShopTrend, shopCategories, shopDateParams, shopItems, shopSummary, shopTrend } from '../src/shop.mjs';

test('shop date params map one day to the platform recent1 contract', () => {
  const params = shopDateParams({ dateType: 'day' }, new Date(2026, 8, 30, 12, 0, 0));
  assert.deepEqual(params, { dateType: 'recent1', dateRange: '2026-09-29|2026-09-29', device: '0' });
});

test('shop summary preserves missing metrics as null', () => {
  const summary = normalizeShopSummary({ response: { data: { uv: 123, payAmt: { value: 456.7 }, payRate: 0.12, uvVariRate: -0.1 } } }, { dateType: 'recent7', dateRange: '2026-09-23|2026-09-29', device: '0' });
  assert.equal(summary.metrics.uv, 123);
  assert.equal(summary.metrics.payAmt, 456.7);
  assert.equal(summary.metrics.payBuyerCnt, null);
  assert.equal(summary.comparisons.uvVariRate, -0.1);
});

test('shop summary calls the registered read operation', async () => {
  const calls = [];
  const result = await shopSummary('http://127.0.0.1:1', { dateType: 'recent7', dateRange: '2026-09-23|2026-09-29' }, async (_cdp, operation, params) => {
    calls.push({ operation, params });
    return { response: { data: { uv: 1 } } };
  });
  assert.equal(calls[0].operation, 'shop.trade-summary');
  assert.equal(result.metrics.uv, 1);
});

test('shop categories expose platform category ids without guessing', async () => {
  const calls = [];
  const result = await shopCategories('http://127.0.0.1:1', { dateType: 'recent7', dateRange: '2026-09-23|2026-09-29' }, async (_cdp, operation, params) => {
    calls.push({ operation, params });
    return { response: { data: { topList: [{ categoryId: 123, categoryName: '一级&gt;二级' }] } } };
  });
  assert.equal(calls[0].operation, 'shop.trade-categories');
  assert.deepEqual(result.categories, [{ categoryId: '123', categoryName: '一级 > 二级' }]);
  assert.deepEqual(normalizeShopCategories({ response: { data: { topList: [] } } }, { dateType: 'recent7', dateRange: 'x' }).categories, []);
});

test('shop trend requires an explicit category and one metric', async () => {
  await assert.rejects(() => shopTrend('http://127.0.0.1:1', { indexCode: 'payAmt' }, async () => ({})), /category-id/);
  await assert.rejects(() => shopTrend('http://127.0.0.1:1', { categoryId: '1', indexCode: 'payAmt,uv' }, async () => ({})), /one --index-code/);
});

test('shop trend emits explicit dates only when the period and value count agree', () => {
  const trend = normalizeShopTrend({ response: { data: { self: [{ payAmt: [10, 20] }], lastDay: '2026-09-29' } } }, { dateType: 'recent7', dateRange: '2026-09-28|2026-09-29', device: '0', categoryId: '123', indexs: 'payAmt' });
  assert.deepEqual(trend.series[0].points, [{ date: '2026-09-28', value: 10 }, { date: '2026-09-29', value: 20 }]);
  const mismatch = normalizeShopTrend({ response: { data: { self: [{ payAmt: [10] }] } } }, { dateType: 'recent7', dateRange: '2026-09-28|2026-09-29', device: '0', categoryId: '123', indexs: 'payAmt' });
  assert.deepEqual(mismatch.series[0].points, []);
});

test('shop items normalize metrics and paginate to a requested top N', async () => {
  const row = (id, payAmt) => ({ itemId: { value: id }, item: { itemId: id, title: `商品${id}`, itemNO: `NO-${id}`, categoryId: 10 }, payAmt: { value: payAmt, cycleCrc: 0.1 }, itmUv: { value: 100 } });
  const calls = [];
  const result = await shopItems('http://127.0.0.1:1', { dateType: 'recent7', dateRange: '2026-09-23|2026-09-29', top: 3, pageSize: 2 }, async (_cdp, operation, params) => {
    calls.push({ operation, params });
    return { response: { data: { recordCount: 4, data: params.page === 1 ? [row('1', 20), row('2', 10)] : [row('3', 5), row('4', 1)] } } };
  });
  assert.equal(result.returnedCount, 3);
  assert.equal(result.stoppedBy, 'targetTopN');
  assert.equal(result.items[0].metrics.payAmt.value, 20);
  assert.equal(result.items[0].metrics.payAmt.cycleCrc, 0.1);
  assert.deepEqual(calls.map((entry) => entry.operation), ['item.rank', 'item.rank']);
  assert.equal(normalizeShopItem(row('9', 1)).categoryId, '10');
});
