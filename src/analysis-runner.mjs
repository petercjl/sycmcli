import { CliError, invariant } from './errors.mjs';

function valueOf(value) { return value && typeof value === 'object' && 'value' in value ? Number(value.value) : Number(value); }
function finite(value) { const number = valueOf(value); return Number.isFinite(number) ? number : 0; }
function quantile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * ratio; const lower = Math.floor(position); const upper = Math.ceil(position);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
function rowsOf(input) {
  const candidates = [input.rows, input.items, input.words, input.shops, input.data, input.data?.data, input.response?.data?.data];
  const rows = candidates.find(Array.isArray);
  invariant(rows, 'ANALYSIS_INPUT_INVALID', 'Analysis input must contain an array in rows, items, words, shops, data, data.data, or response.data.data.', { exitCode: 2 });
  return rows;
}
function itemName(row) { return row.title || row.item?.title || row.name || String(row.itemId?.value || row.itemId || row.id || 'unknown'); }
function itemId(row) { return String(row.itemId?.value || row.item?.itemId || row.itemId || row.id || ''); }
function priceOf(row) { return finite(row.price ?? row.priceYuan ?? row.payPct ?? row.item?.price); }
function metric(row, names) { for (const name of names) if (row[name] !== undefined) return finite(row[name]); return 0; }

function itemProfile(input) {
  const rows = rowsOf(input);
  const normalized = rows.map((row) => ({ itemId: itemId(row), title: itemName(row), shop: row.shopTitle || row.shop?.title || null, price: priceOf(row), gmv: metric(row, ['payAmt', 'gmv', 'tradeAmount']), buyers: metric(row, ['payByrCnt', 'buyers']), uv: metric(row, ['itmUv', 'uv']), conversion: metric(row, ['payRate', 'conversionRate']) }));
  return {
    itemCount: normalized.length,
    medians: { price: quantile(normalized.map((row) => row.price), .5), gmv: quantile(normalized.map((row) => row.gmv), .5), uv: quantile(normalized.map((row) => row.uv), .5), conversion: quantile(normalized.map((row) => row.conversion), .5) },
    topByGmv: normalized.sort((a, b) => b.gmv - a.gmv).slice(0, Number(input.top || 20))
  };
}

function priceBands(input) {
  const rows = rowsOf(input); const prices = rows.map(priceOf).filter((value) => value > 0);
  invariant(prices.length, 'ANALYSIS_INPUT_INVALID', 'No positive price values were found.', { exitCode: 2 });
  const cuts = input.cuts || [quantile(prices, .25), quantile(prices, .5), quantile(prices, .75)];
  const labels = [`≤${cuts[0]}`, `${cuts[0]}-${cuts[1]}`, `${cuts[1]}-${cuts[2]}`, `>${cuts[2]}`];
  const bands = labels.map((label) => ({ label, itemCount: 0, gmv: 0, uv: 0, buyers: 0 }));
  for (const row of rows) { const price = priceOf(row); const index = price <= cuts[0] ? 0 : price <= cuts[1] ? 1 : price <= cuts[2] ? 2 : 3; bands[index].itemCount += 1; bands[index].gmv += metric(row, ['payAmt', 'gmv']); bands[index].uv += metric(row, ['itmUv', 'uv']); bands[index].buyers += metric(row, ['payByrCnt', 'buyers']); }
  const totalGmv = bands.reduce((sum, row) => sum + row.gmv, 0);
  return { cuts, bands: bands.map((row) => ({ ...row, gmvShare: totalGmv ? row.gmv / totalGmv : 0 })) };
}

function keywordAnalysis(input) {
  const rows = rowsOf(input).map((row) => { const volume = metric(row, ['seIpvUvHits', 'searchVolume', 'uv']); const conversion = metric(row, ['payConvRate', 'payRate', 'conversionRate']); const competition = metric(row, ['competition', 'onlineItemCnt']) || 1; return { keyword: row.searchWord || row.keyword || row.word || '', volume, conversion, competition, opportunityScore: volume * Math.max(conversion, .0001) / competition }; });
  return { keywordCount: rows.length, topOpportunity: rows.sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, Number(input.top || 30)) };
}

function portfolio(input) {
  const rows = rowsOf(input).map((row) => ({ itemId: itemId(row), title: itemName(row), gmv: metric(row, ['payAmt', 'gmv']), uv: metric(row, ['itmUv', 'uv']), conversion: metric(row, ['payRate', 'conversionRate']) }));
  const gmvCut = quantile(rows.map((row) => row.gmv), .75); const uvCut = quantile(rows.map((row) => row.uv), .75); const convCut = quantile(rows.map((row) => row.conversion), .5);
  const groups = { core: [], potential: [], traffic: [], observe: [] };
  for (const row of rows) { const group = row.gmv >= gmvCut ? 'core' : row.uv >= uvCut && row.conversion >= convCut ? 'potential' : row.uv >= uvCut ? 'traffic' : 'observe'; groups[group].push(row); }
  return { thresholds: { gmvP75: gmvCut, uvP75: uvCut, conversionMedian: convCut }, groups };
}

function fluctuation(input) {
  const rows = rowsOf(input); const metricName = String(input.metric || 'value'); const threshold = Number(input.threshold ?? .3);
  const points = rows.map((row) => ({ date: row.date || row.statDate || row.time || null, value: metric(row, [metricName, 'value']) }));
  const changes = points.slice(1).map((point, index) => { const previous = points[index].value; const rate = previous ? (point.value - previous) / previous : null; return { ...point, previous, rate, anomaly: rate !== null && Math.abs(rate) >= threshold }; });
  return { metric: metricName, threshold, points, changes, anomalies: changes.filter((row) => row.anomaly) };
}

function comparison(input) {
  const rows = rowsOf(input); const metrics = input.metrics || ['payAmt', 'payByrCnt', 'itmUv', 'payRate'];
  return { entities: rows.map((row) => ({ id: row.id || row.sellerId || itemId(row), name: row.name || row.shopTitle || itemName(row), metrics: Object.fromEntries(metrics.map((name) => [name, metric(row, [name])])) })), metrics };
}

function performanceReport(input) {
  const current = input.current || {}; const previous = input.previous || {}; const metrics = input.metrics || ['payAmt', 'payByrCnt', 'itmUv', 'payRate'];
  const lines = metrics.map((name) => { const value = finite(current[name]); const before = finite(previous[name]); const change = before ? (value - before) / before : null; return `- ${name}: ${value}${change === null ? '' : `（环比 ${(change * 100).toFixed(1)}%）`}`; });
  return { period: input.period || null, metrics: Object.fromEntries(metrics.map((name) => [name, { value: finite(current[name]), previous: finite(previous[name]), changeRate: finite(previous[name]) ? (finite(current[name]) - finite(previous[name])) / finite(previous[name]) : null }])), markdown: `# 店铺经营报告\n\n${input.period ? `周期：${input.period}\n\n` : ''}${lines.join('\n')}` };
}

export function runAnalysis(capabilityId, input) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'ANALYSIS_INPUT_INVALID', 'Analysis input must be a JSON object.', { exitCode: 2 });
  if (['category-best-selling-items-analysis', 'category-top-items-profile', 'item-gallery-analysis'].includes(capabilityId)) return itemProfile(input);
  if (['category-price-band-analysis', 'category-market-analysis'].includes(capabilityId)) return priceBands(input);
  if (['category-keyword-analysis', 'market-blue-ocean-opportunity-mining'].includes(capabilityId)) return keywordAnalysis(input);
  if (['shop-core-potential-item-analysis', 'comprehensive-product-data-analysis'].includes(capabilityId)) return portfolio(input);
  if (['item-traffic-fluctuation-analysis', 'item-ops-event-impact-analysis'].includes(capabilityId)) return fluctuation(input);
  if (['competitor-shop-analysis', 'competitor-comparison-action-tracking', 'sycm-item-competitor-analysis'].includes(capabilityId)) return comparison(input);
  if (['weekly-or-monthly-store-performance-reports', 'shop-core-index-analysis', 'daily-shop-inspection'].includes(capabilityId)) return performanceReport(input);
  throw new CliError('ANALYSIS_NOT_IMPLEMENTED', `No deterministic local analyzer is registered for ${capabilityId}.`, { hint: 'Use business show to inspect the capability and compose its registered reads in the Agent workflow.' });
}
