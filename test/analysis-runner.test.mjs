import test from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysis } from '../src/analysis-runner.mjs';

const items = [
  { itemId: '1', title: 'A', price: 10, payAmt: { value: 100 }, itmUv: { value: 1000 }, payRate: { value: .1 } },
  { itemId: '2', title: 'B', price: 20, payAmt: { value: 400 }, itmUv: { value: 500 }, payRate: { value: .3 } },
  { itemId: '3', title: 'C', price: 30, payAmt: { value: 200 }, itmUv: { value: 900 }, payRate: { value: .2 } },
  { itemId: '4', title: 'D', price: 40, payAmt: { value: 800 }, itmUv: { value: 300 }, payRate: { value: .4 } }
];

test('item profile and portfolio analyzers return deterministic structures', () => {
  const profile = runAnalysis('category-top-items-profile', { items, top: 2 });
  assert.equal(profile.itemCount, 4);
  assert.deepEqual(profile.topByGmv.map((row) => row.itemId), ['4', '2']);
  const portfolio = runAnalysis('shop-core-potential-item-analysis', { items });
  assert.ok(portfolio.groups.core.some((row) => row.itemId === '4'));
});

test('keyword, price band, fluctuation and report analyzers work', () => {
  assert.equal(runAnalysis('category-price-band-analysis', { items }).bands.length, 4);
  assert.equal(runAnalysis('category-keyword-analysis', { rows: [{ keyword: 'a', searchVolume: 100, conversionRate: .2, competition: 2 }] }).topOpportunity[0].opportunityScore, 10);
  assert.equal(runAnalysis('item-traffic-fluctuation-analysis', { rows: [{ date: '1', value: 100 }, { date: '2', value: 50 }], threshold: .3 }).anomalies.length, 1);
  assert.match(runAnalysis('weekly-or-monthly-store-performance-reports', { current: { payAmt: 120 }, previous: { payAmt: 100 }, metrics: ['payAmt'] }).markdown, /20\.0%/);
});
