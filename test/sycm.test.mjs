import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDateRange, normalizeItem, normalizeItemRankFilters, normalizeKeyword } from '../src/sycm.mjs';

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

test('market item ranking omits seller and operator identity identifiers', () => {
  const item = normalizeItem({ itemId: 'item-1', sellerId: 'seller-private', itemUserId: 'item-user-private', shopUserId: 'shop-user-private', item: { userId: 'nested-private', title: 'Demo' }, shop: { userId: 'nested-shop-private', title: 'Shop' } });
  assert.equal(item.itemId, 'item-1');
  assert.equal(item.shopTitle, 'Shop');
  assert.equal('sellerId' in item, false);
  assert.equal('itemUserId' in item, false);
  assert.equal('shopUserId' in item, false);
});

test('market keyword ranking preserves platform ranges and missing comparisons', () => {
  const word = normalizeKeyword({
    searchWord: '蛋糕模具',
    rn: { value: 2 },
    seIpvUvHits: { value: '1万 ~ 2万', cycleCrc: null },
    clickThroughRate: { value: 0.75 },
    payRate: { value: '15% ~ 20%' }
  });
  assert.deepEqual(word, {
    searchWord: '蛋糕模具',
    rank: 2,
    seIpvUvHits: '1万 ~ 2万',
    seIpvUvHitsCrc: null,
    clickUv: undefined,
    clickThroughRate: 0.75,
    payRate: '15% ~ 20%'
  });
});

test('market item rank exposes the applied price-band filter without private identity', () => {
  assert.deepEqual(normalizeItemRankFilters({ priceSeg: '3', sellerType: '0', keyword: '模具' }), {
    priceSeg: '3', minPrice: '', maxPrice: '', sellerType: '0', keyword: '模具'
  });
  assert.deepEqual(normalizeItemRankFilters({ priceSeg: 'all', minPrice: '20', maxPrice: '50' }), {
    priceSeg: '', minPrice: '20', maxPrice: '50', sellerType: '-1', keyword: ''
  });
});
