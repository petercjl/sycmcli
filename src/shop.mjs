import { invariant } from './errors.mjs';
import { runRegisteredOperation } from './data-runner.mjs';
import { buildDateRange } from './sycm.mjs';

const SUMMARY_FIELDS = [
  'uv', 'payAmt', 'payBuyerCnt', 'payRate', 'payPct',
  'orderAmt', 'orderBuyerCnt', 'orderToPayRate', 'orderRate',
  'paySubOrdersCnt', 'newBuyerCnt', 'oldBuyerCnt'
];

const COMPARISON_FIELDS = [
  'uvVariRate', 'payAmtVariRate', 'payBuyerCntVariRate', 'payRateVariRate',
  'payPctVariRate', 'orderAmtVariRate', 'orderBuyerCntVariRate',
  'orderToPayRateVariRate', 'orderRateVariRate', 'paySubOrdersCntVariRate',
  'newBuyerCntVariRate', 'oldBuyerCntVariRate'
];

const ITEM_METRIC_FIELDS = [
  'payAmt', 'payByrCnt', 'payItmCnt', 'payRate', 'payPct', 'itmUv', 'itmPv',
  'uvAvgValue', 'itemCartCnt', 'itemCltByrCnt', 'visitCltRate', 'crtAmt',
  'crtByrCnt', 'crtRate', 'seGuideUv', 'seGuidePayByrCnt', 'seGuidePayRate',
  'rfdSucGoodsAmt', 'sucRefundAmt', 'itmBounceRate', 'stayTimeAvg'
];

function valueOf(field) {
  return field && typeof field === 'object' && 'value' in field ? field.value : field;
}

function pick(source, fields) {
  return Object.fromEntries(fields.map((field) => [field, valueOf(source?.[field]) ?? null]));
}

function decodeHtmlText(value) {
  return typeof value === 'string'
    ? value.replaceAll('&gt;', ' > ').replaceAll('&lt;', ' < ').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
    : value;
}

function responseData(result) {
  const body = result?.response ?? result;
  return body?.data?.data ?? body?.data ?? body?.content?.data ?? null;
}

function metricField(field) {
  if (field === undefined || field === null) return { value: null, cycleCrc: null, syncCrc: null };
  if (typeof field !== 'object') return { value: field, cycleCrc: null, syncCrc: null };
  return { value: field.value ?? null, cycleCrc: field.cycleCrc ?? field.cycleCqc ?? null, syncCrc: field.syncCrc ?? field.syncCqc ?? null };
}

export function normalizeShopItem(row) {
  const item = row?.item || {};
  return {
    itemId: String(valueOf(row?.itemId) ?? item.itemId ?? ''),
    title: item.title ?? null,
    itemNo: item.itemNO ?? null,
    status: row?.itemStatus ?? null,
    online: item.online ?? null,
    isNew: row?.isTmallNewItem ?? null,
    itemTag: row?.itemTag ?? null,
    categoryId: item.categoryId === undefined || item.categoryId === null ? null : String(item.categoryId),
    categoryLevel1Id: valueOf(row?.cateLevel1Id) === undefined || valueOf(row?.cateLevel1Id) === null ? null : String(valueOf(row?.cateLevel1Id)),
    categoryLevel2Id: valueOf(row?.cateLevel2Id) === undefined || valueOf(row?.cateLevel2Id) === null ? null : String(valueOf(row?.cateLevel2Id)),
    pictureUrl: item.pictUrl ?? null,
    detailUrl: decodeHtmlText(item.detailUrl ?? null),
    metrics: Object.fromEntries(ITEM_METRIC_FIELDS.map((field) => [field, metricField(row?.[field])]))
  };
}

function dateLabels(dateRange, count) {
  const [startText, endText] = String(dateRange || '').split('|');
  const start = new Date(`${startText}T00:00:00Z`);
  const end = new Date(`${endText}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return [];
  const labels = [];
  for (let time = start.getTime(); time <= end.getTime(); time += 86_400_000) labels.push(new Date(time).toISOString().slice(0, 10));
  return labels.length === count ? labels : [];
}

export function shopDateParams(options = {}, now = new Date()) {
  const requestedDateType = options.dateType || 'recent7';
  invariant(['day', 'recent7', 'recent30'].includes(requestedDateType), 'INVALID_ARGUMENT', '--date-type must be day, recent7, or recent30.', { exitCode: 2 });
  return {
    dateType: requestedDateType === 'day' ? 'recent1' : requestedDateType,
    dateRange: options.dateRange || buildDateRange(requestedDateType, now),
    device: String(options.device ?? '0')
  };
}

export function normalizeShopSummary(result, request) {
  const data = responseData(result);
  invariant(data && typeof data === 'object' && !Array.isArray(data), 'SYCM_DATA_MISSING', 'Shop performance summary data is unavailable.');
  return {
    dateType: request.dateType === 'recent1' ? 'day' : request.dateType,
    dateRange: request.dateRange,
    device: request.device,
    metrics: pick(data, SUMMARY_FIELDS),
    comparisons: pick(data, COMPARISON_FIELDS)
  };
}

export function normalizeShopTrend(result, request) {
  const data = responseData(result);
  invariant(data && typeof data === 'object', 'SYCM_DATA_MISSING', 'Shop performance trend data is unavailable.');
  const self = Array.isArray(data.self) ? data.self : [];
  const series = self.map((entry) => {
    const values = Array.isArray(entry?.[request.indexs]) ? entry[request.indexs].map(valueOf) : [];
    const dates = dateLabels(request.dateRange, values.length);
    return {
      indexCode: request.indexs,
      values,
      points: dates.map((date, index) => ({ date, value: values[index] })),
      lastDay: entry?.lastDay ?? data.lastDay ?? null
    };
  });
  return {
    dateType: request.dateType === 'recent1' ? 'day' : request.dateType,
    dateRange: request.dateRange,
    device: request.device,
    categoryId: request.categoryId,
    indexCode: request.indexs,
    series
  };
}

export function normalizeShopCategories(result, request) {
  const data = responseData(result);
  invariant(data && typeof data === 'object', 'SYCM_DATA_MISSING', 'Shop trade categories are unavailable.');
  const categories = (Array.isArray(data.topList) ? data.topList : []).map((entry) => ({
    categoryId: entry?.categoryId === undefined || entry?.categoryId === null ? null : String(entry.categoryId),
    categoryName: decodeHtmlText(entry?.categoryName ?? null)
  })).filter((entry) => entry.categoryId);
  return {
    dateType: request.dateType === 'recent1' ? 'day' : request.dateType,
    dateRange: request.dateRange,
    categories
  };
}

export async function shopSummary(cdpUrl, options = {}, runner = runRegisteredOperation) {
  const request = shopDateParams(options);
  const result = await runner(cdpUrl, 'shop.trade-summary', request);
  return normalizeShopSummary(result, request);
}

export async function shopCategories(cdpUrl, options = {}, runner = runRegisteredOperation) {
  const request = shopDateParams(options);
  const result = await runner(cdpUrl, 'shop.trade-categories', { dateType: request.dateType, dateRange: request.dateRange });
  return normalizeShopCategories(result, request);
}

export async function shopItems(cdpUrl, options = {}, runner = runRegisteredOperation) {
  const request = shopDateParams(options);
  const page = Number(options.page || 1);
  const pageSize = Math.min(Number(options.pageSize || 20), 20);
  const targetTopN = Number(options.top || 0);
  const collectAll = Boolean(options.all);
  const maxPages = Number(options.maxPages || (collectAll ? 100 : (targetTopN ? Math.ceil(targetTopN / pageSize) : 1)));
  const items = [];
  const seen = new Set();
  let recordCount = 0;
  let fetchedPages = 0;
  let stoppedBy = 'maxPages';
  for (let offset = 0; offset < maxPages; offset += 1) {
    const currentPage = page + offset;
    const params = { dateType: request.dateType, dateRange: request.dateRange, page: currentPage, pageSize };
    if (options.order !== undefined) params.order = options.order;
    if (options.orderBy !== undefined) params.orderBy = options.orderBy;
    const result = await runner(cdpUrl, 'item.rank', params);
    const body = result?.response ?? result;
    const data = body?.data ?? body?.content?.data ?? null;
    invariant(data && typeof data === 'object', 'SYCM_DATA_MISSING', 'Shop item performance data is unavailable.');
    const rows = Array.isArray(data.data) ? data.data : [];
    recordCount = Number(data.recordCount ?? recordCount ?? rows.length);
    fetchedPages += 1;
    if (!rows.length) { stoppedBy = 'emptyPage'; break; }
    for (const row of rows) {
      const normalized = normalizeShopItem(row);
      if (!normalized.itemId || seen.has(normalized.itemId)) continue;
      seen.add(normalized.itemId);
      items.push(normalized);
      if (targetTopN && items.length >= targetTopN) { stoppedBy = 'targetTopN'; break; }
    }
    if (stoppedBy === 'targetTopN') break;
    if (rows.length < pageSize) { stoppedBy = 'shortPage'; break; }
    if (collectAll && recordCount && items.length >= recordCount) { stoppedBy = 'recordCount'; break; }
  }
  return { dateType: request.dateType === 'recent1' ? 'day' : request.dateType, dateRange: request.dateRange, page, pageSize, collectAll, targetTopN: targetTopN || null, maxPages, fetchedPages, stoppedBy, recordCount, returnedCount: items.length, items };
}

export async function shopTrend(cdpUrl, options = {}, runner = runRegisteredOperation) {
  invariant(options.categoryId, 'MISSING_ARGUMENT', 'Shop trend requires --category-id.', { exitCode: 2 });
  invariant(options.indexCode, 'MISSING_ARGUMENT', 'Shop trend requires --index-code.', { exitCode: 2 });
  invariant(!String(options.indexCode).includes(','), 'INVALID_ARGUMENT', 'Shop trend currently accepts one --index-code at a time.', { exitCode: 2 });
  const request = {
    ...shopDateParams(options),
    categoryId: String(options.categoryId),
    indexs: String(options.indexCode),
    diff: String(options.diff ?? '0')
  };
  const result = await runner(cdpUrl, 'shop.trade-trend', request);
  return normalizeShopTrend(result, request);
}
