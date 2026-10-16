import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItemDiagnosis, normalizeItemFlow, normalizeItemGallery, normalizeItemOverview, shopItemDetail, shopItemGallery } from '../src/shop-item.mjs';

const request = { itemId: '123', dateType: 'recent7', dateRange: '2026-10-01|2026-10-07' };

test('shop item overview preserves metric metadata and removes private identity fields', () => {
  const result = normalizeItemOverview({ response: { data: { itemId: { value: '123' }, sellerId: { value: 'private' }, statDate: { value: 1 }, payAmt: { value: 10, cycleCrc: null } } } }, request);
  assert.deepEqual(result.metrics.payAmt, { value: 10, cycleCrc: null });
  assert.equal('sellerId' in result.metrics, false);
});

test('shop item diagnosis keeps explicit null comparison fields', () => {
  const result = normalizeItemDiagnosis({ response: { data: { indexName: { value: '支付转化率' }, indexRelaDiff: { value: null }, payRate: { value: 0.1 }, payRateCrc: { value: null } } } }, request);
  assert.equal(result.focusDifference, null);
  assert.deepEqual(result.metrics.payRateCrc, { value: null });
});

test('shop item flow returns both tree and flattened channels', () => {
  const result = normalizeItemFlow({ response: { data: [{ pageId: 'a', pageName: '搜索', sellerId: 'private', children: [{ pageId: 'b', pPageId: 'a', pageName: '手淘搜索' }] }] } }, request);
  assert.equal(result.channels.length, 2);
  assert.equal(result.channels[1].parentPageId, 'a');
  assert.equal('sellerId' in result.tree[0], false);
});

test('shop item detail performs overview and module reads serially', async () => {
  const calls = [];
  const result = await shopItemDetail('http://127.0.0.1:1', request, async (_cdp, operation) => {
    calls.push(operation);
    return operation === 'item.detail-overview' ? { response: { data: { itemPayUv: { value: 2 } } } } : { response: { data: [{ detailType: 'image', sellerId: 'private' }] } };
  });
  assert.deepEqual(calls, ['item.detail-overview', 'item.detail-list']);
  assert.equal(result.modules[0].detailType, 'image');
  assert.equal('sellerId' in result.modules[0], false);
});

test('shop item gallery preserves material metrics and removes private identity fields', () => {
  const result = normalizeItemGallery({ response: { data: { recordCount: 1, data: [{ contentId: 'c1', contentType: 'gallery', sellerId: 'private', itemExposeUv: { value: 100, cycleCrc: null } }] } } }, request);
  assert.equal(result.recordCount, 1);
  assert.deepEqual(result.materials[0].itemExposeUv, { value: 100, cycleCrc: null });
  assert.equal('sellerId' in result.materials[0], false);
});

test('shop item gallery supplies stable endpoint defaults', async () => {
  let received;
  await shopItemGallery('http://127.0.0.1:1', request, async (_cdp, operation, params) => {
    assert.equal(operation, 'item.main-pic-material');
    received = params;
    return { response: { data: { recordCount: 0, data: [] } } };
  });
  assert.equal(received.byrType, 'all');
  assert.equal(received.orderBy, 'itemExposeUv');
  assert.equal(received.page, 1);
  assert.equal(received.pageSize, 10);
  assert.match(received.indexCode, /itemPayConvertRate/);
});
