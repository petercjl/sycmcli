import { CliError, invariant } from './errors.mjs';
import { pageFetch } from './cdp.mjs';

const MAX_PAGE_SIZE = 20;
const DAY_MS = 86_400_000;

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildDateRange(dateType = 'day', now = new Date()) {
  invariant(['day', 'recent7', 'recent30'].includes(dateType), 'DATE_RANGE_REQUIRED', `--date-range is required for date type "${dateType}".`, { exitCode: 2 });
  const cutoffOffset = now.getHours() < 8 ? 1 : 0;
  const end = new Date(now.getTime() - (1 + cutoffOffset) * DAY_MS);
  if (dateType === 'recent7') return `${formatDate(new Date(now.getTime() - (7 + cutoffOffset) * DAY_MS))}|${formatDate(end)}`;
  if (dateType === 'recent30') return `${formatDate(new Date(now.getTime() - (30 + cutoffOffset) * DAY_MS))}|${formatDate(end)}`;
  return `${formatDate(end)}|${formatDate(end)}`;
}

function valueOf(field) {
  return field && typeof field === 'object' && 'value' in field ? field.value : field;
}

function cycleOf(field) {
  return field && typeof field === 'object' ? field.cycleCrc ?? field.cycleCqc ?? null : null;
}

function categoriesFrom(body) {
  return (Array.isArray(body?.data) ? body.data : []).map((row) => ({
    parentCateId: row[0], cateId: row[1], cateName: row[2], cateFlag: row[3], marketVersion: row[4],
    isLeaf: row[5] === 'Y', cateLevel1Id: row[6], cateLevel1Name: row[7]
  }));
}

function fullCategoryName(node, byId) {
  const names = [];
  const seen = new Set();
  let current = node;
  while (current && !seen.has(String(current.cateId))) {
    seen.add(String(current.cateId));
    names.unshift(current.cateName);
    const parentId = String(current.parentCateId ?? '');
    if (!parentId || parentId === '0') break;
    current = byId.get(parentId);
  }
  return names.join(' > ');
}

export async function categoryTree(cdpUrl) {
  const body = await pageFetch(cdpUrl, { path: '/mc/common/free/getCateInfo.json', params: { marketVersion: 'free' }, useToken: false });
  const categories = categoriesFrom(body);
  return { recordCount: categories.length, categories };
}

export async function categorySearch(cdpUrl, { keyword, exact = false, leafOnly = true, cateLevel1Id, limit } = {}) {
  invariant(keyword, 'MISSING_ARGUMENT', 'Category search requires --keyword.', { exitCode: 2 });
  const { categories: all } = await categoryTree(cdpUrl);
  const term = String(keyword).trim().toLowerCase();
  const byId = new Map(all.map((row) => [String(row.cateId), row]));
  let categories = all.filter((row) => {
    if (leafOnly && !row.isLeaf) return false;
    if (cateLevel1Id !== undefined && String(row.cateLevel1Id) !== String(cateLevel1Id)) return false;
    const name = String(row.cateName || '').toLowerCase();
    return exact ? name === term : name.includes(term);
  }).map((row) => ({ ...row, cateFullName: fullCategoryName(row, byId) }));
  if (limit) categories = categories.slice(0, limit);
  return { recordCount: categories.length, categories };
}

export async function mainCategory(cdpUrl) {
  const body = await pageFetch(cdpUrl, { path: '/portal/shop/getMainCateInfo.json', params: {}, useToken: false });
  const data = body?.content?.data || body?.data;
  if (!data) throw new CliError('SYCM_DATA_MISSING', body?.content?.message || 'Main category data is unavailable.');
  return {
    cateLevel1Id: data.cateLevel1Id ?? null,
    cateLevel1Name: data.cateLevel1Name ?? null,
    cateId: data.cateId ?? data.cateLevel2Id ?? null,
    cateName: data.cateName ?? data.cateLevel2Name ?? null
  };
}

async function resolveCategory(cdpUrl, requested) {
  if (requested) return String(requested);
  const [{ categories }, main] = await Promise.all([categoryTree(cdpUrl), mainCategory(cdpUrl).catch(() => ({}))]);
  const match = categories.find((row) => String(row.cateLevel1Id) === String(main.cateLevel1Id) && Number(row.cateFlag) === 2)
    || categories.find((row) => Number(row.cateFlag) === 2)
    || categories.find((row) => row.isLeaf);
  if (!match) throw new CliError('CATEGORY_UNAVAILABLE', 'No market category is available for this store.');
  return String(match.cateId);
}

function rankConfig(rankType) {
  if (rankType === 'flow') return { path: '/mc/mq/mkt/item/offline/rank/search.json', indexCode: 'uv,searchUv', includeSort: true };
  if (rankType === 'add') return { path: '/mc/mq/mkt/item/offline/rank/purpose.json', indexCode: 'cartByrCnt,cltByrCnt,uv', includeSort: true };
  if (rankType === 'newitm_ipv') return { path: '/mc/mq/mkt/item/offline/rank.json', indexCode: 'uv,payByrCnt,cartByrCnt', includeSort: false };
  return { path: '/mc/mq/mkt/item/offline/rank.json', indexCode: 'payByrCnt,uv', includeSort: false };
}

function normalizeItem(row) {
  const get = (key) => valueOf(row?.[key]);
  const item = row?.item || {};
  const shop = row?.shop || {};
  return {
    rank: get('cateRankId') ?? get('rn') ?? get('rank') ?? null,
    rankCycleCqc: cycleOf(row?.cateRankId) ?? cycleOf(row?.rn) ?? cycleOf(row?.rank),
    itemId: get('itemId') ?? item.itemId ?? null,
    title: item.title ?? get('title') ?? null,
    pictUrl: item.pictUrl ?? get('pictUrl') ?? null,
    detailUrl: item.detailUrl ?? get('detailUrl') ?? null,
    itemUserId: item.userId ?? get('userId') ?? get('itemUserId') ?? null,
    sellerId: get('sellerId') ?? null,
    shopTitle: shop.title ?? get('shopTitle') ?? null,
    shopUrl: shop.shopUrl ?? get('shopUrl') ?? null,
    shopPictureUrl: shop.pictureUrl ?? get('shopPictureUrl') ?? null,
    shopUserId: shop.userId ?? get('shopUserId') ?? null,
    b2CShop: shop.b2CShop ?? get('b2CShop') ?? null,
    coreKeywords: get('coreKeyWord') ?? get('coreKeywords') ?? null,
    payByrCnt: get('payByrCnt') ?? null,
    uv: get('uv') ?? null,
    searchUv: get('searchUv') ?? null,
    cartByrCnt: get('cartByrCnt') ?? null,
    cltByrCnt: get('cltByrCnt') ?? null,
    isMonitor: get('isMonitor') ?? null,
    isSelfItem: get('isSelfItem') ?? null
  };
}

export async function itemRank(cdpUrl, options = {}) {
  const rankType = options.rankType || 'gmv';
  invariant(['gmv', 'growth', 'flow', 'add', 'newitm_ipv'].includes(rankType), 'INVALID_ARGUMENT', 'Item rank type must be gmv, growth, flow, add, or newitm_ipv.', { exitCode: 2 });
  const config = rankConfig(rankType);
  const cateId = await resolveCategory(cdpUrl, options.cateId);
  const dateType = options.dateType || 'recent7';
  const dateRange = options.dateRange || buildDateRange(dateType);
  const page = options.page || 1;
  const requestedPageSize = options.pageSize || 10;
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  const targetTopN = options.top || 0;
  const maxPages = options.maxPages || (targetTopN ? Math.ceil(targetTopN / pageSize) : 1);
  const seen = new Set();
  const items = [];
  const warnings = [];
  let duplicateCount = 0;
  let recordCount = 0;
  let stoppedBy = 'maxPages';
  let fetchedPages = 0;
  if (requestedPageSize > MAX_PAGE_SIZE) warnings.push(`page-size ${requestedPageSize} was capped at ${MAX_PAGE_SIZE}.`);
  for (let offset = 0; offset < maxPages; offset += 1) {
    const currentPage = page + offset;
    const params = {
      dateRange, dateType, pageSize, page: currentPage, cateId, rankType,
      minPrice: options.minPrice || '', maxPrice: options.maxPrice || '',
      priceSeg: ['all', 'customizePrice'].includes(options.priceSeg) ? '' : (options.priceSeg || ''),
      sellerType: options.sellerType ?? '-1', keyWord: options.keyword || '', cateFlag: options.cateFlag ?? '2',
      indexCode: options.indexCode || config.indexCode, marketVersion: 'free'
    };
    if (config.includeSort || options.order !== undefined) params.order = options.order || '';
    if (config.includeSort || options.orderBy !== undefined) params.orderBy = options.orderBy || '';
    const body = await pageFetch(cdpUrl, { path: config.path, params });
    fetchedPages += 1;
    const inner = body?.data || {};
    const rows = Array.isArray(inner) ? inner : (Array.isArray(inner.data) ? inner.data : []);
    recordCount = Number(inner.recordCount || recordCount || rows.length);
    if (!rows.length) { stoppedBy = 'emptyPage'; break; }
    for (const row of rows) {
      const normalized = normalizeItem(row);
      const key = String(normalized.itemId || `${currentPage}:${items.length}`);
      if (seen.has(key)) { duplicateCount += 1; continue; }
      seen.add(key);
      items.push(normalized);
      if (targetTopN && items.length >= targetTopN) { stoppedBy = 'targetTopN'; break; }
    }
    if (stoppedBy === 'targetTopN') break;
    if (rows.length < pageSize) { stoppedBy = 'shortPage'; break; }
  }
  return { cateId, dateRange, dateType, rankType, page, pageSize, requestedPageSize, targetTopN: targetTopN || null, maxPages, fetchedPages, stoppedBy, returnedCount: items.length, recordCount, duplicateCount, warnings, items };
}

export async function priceSegments(cdpUrl, options = {}) {
  const cateId = await resolveCategory(cdpUrl, options.cateId);
  const dateType = options.dateType || 'recent7';
  const dateRange = options.dateRange || buildDateRange(dateType);
  const sellerType = options.sellerType ?? '0';
  const body = await pageFetch(cdpUrl, { path: '/mc/mq/mkt/priceSeg/list.json', params: { dateRange, dateType, cateId, sellerType, marketVersion: 'free' } });
  const priceSegs = (Array.isArray(body?.data) ? body.data : []).map((row) => {
    const priceSegId = valueOf(row.priceSegId);
    const priceSegName = valueOf(row.priceSegName) || '';
    const range = String(priceSegName).match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    const open = String(priceSegName).match(/^(\d+(?:\.\d+)?)以上$/);
    return { priceSegId, priceSegName, label: priceSegName, value: priceSegId, ...(range ? { minPrice: range[1], maxPrice: range[2], isOpenEnded: false } : {}), ...(open ? { minPrice: open[1], maxPrice: '', isOpenEnded: true } : {}) };
  });
  return { cateId, dateRange, dateType, sellerType, recordCount: priceSegs.length, priceSegs };
}

function commonWordParams(options, keywordKey = 'keyword') {
  const dateType = options.dateType || 'day';
  return { dateRange: options.dateRange || buildDateRange(dateType), dateType, device: options.device || '0', [keywordKey]: options.keyword, marketVersion: 'free' };
}

export async function keywordRank(cdpUrl, options = {}) {
  const cateId = await resolveCategory(cdpUrl, options.cateId);
  const params = { ...commonWordParams(options, 'keyWord'), cateId, kwType: options.kwType || 'search', order: options.order || 'desc', orderBy: options.orderBy || 'seIpvUvHits', page: options.page || 1, pageSize: Math.min(options.pageSize || 10, MAX_PAGE_SIZE), rankType: options.rankType || 'hot' };
  const body = await pageFetch(cdpUrl, { path: '/mc/mq/mkt/keyword/rank/pro.json', params });
  const inner = body?.data || {};
  const words = (inner.data || []).map((row) => ({ searchWord: valueOf(row.searchWord), rank: valueOf(row.rn), seIpvUvHits: valueOf(row.seIpvUvHits), seIpvUvHitsCrc: cycleOf(row.seIpvUvHits), clickUv: valueOf(row.clickUv), clickThroughRate: valueOf(row.clickThroughRate), payRate: valueOf(row.payRate) }));
  return { cateId, ...params, recordCount: inner.recordCount || words.length, words };
}

export async function wordOverview(cdpUrl, options = {}) {
  invariant(options.keyword, 'MISSING_ARGUMENT', 'Word overview requires --keyword.', { exitCode: 2 });
  const params = commonWordParams(options);
  const body = await pageFetch(cdpUrl, { path: '/mc/free/searchword/overview.json', params, useToken: false });
  const data = body?.data || {};
  return { keyword: options.keyword, dateRange: params.dateRange, dateType: params.dateType, seIpvUvHits: valueOf(data.seIpvUvHits), seIpvUvHitsCrc: cycleOf(data.seIpvUvHits), clickRateSec: valueOf(data.clickRateSec), clickRateSecCrc: cycleOf(data.clickRateSec), payConvRate: valueOf(data.payConvRate), payConvRateCrc: cycleOf(data.payConvRate), payOrdByrCnt: valueOf(data.payOrdByrCnt), payOrdByrCntCrc: cycleOf(data.payOrdByrCnt) };
}

export async function wordTrend(cdpUrl, options = {}) {
  invariant(options.keyword, 'MISSING_ARGUMENT', 'Word trend requires --keyword.', { exitCode: 2 });
  const params = commonWordParams(options);
  const body = await pageFetch(cdpUrl, { path: '/mc/free/searchword/propertyTrend.json', params, useToken: false });
  return { keyword: options.keyword, dateRange: params.dateRange, dateType: params.dateType, trend: body?.data ?? null };
}

export async function wordRelated(cdpUrl, options = {}) {
  invariant(options.keyword, 'MISSING_ARGUMENT', 'Related-word analysis requires --keyword.', { exitCode: 2 });
  const params = { ...commonWordParams(options, 'keyWord'), cycleFlag: options.cycleFlag || 'cycle', order: options.order || 'desc', orderBy: options.orderBy || 'seIpvUvHits', page: options.page || 1, pageSize: Math.min(options.pageSize || 10, MAX_PAGE_SIZE), rankType: options.rankType || 'related' };
  const body = await pageFetch(cdpUrl, { path: '/mc/mq/mkt/keyword/relate/analysis.json', params });
  const inner = body?.data || {};
  const words = (inner.data || []).map((row) => ({ keyword: valueOf(row.relatedSekeyword), seIpvUvHits: valueOf(row.seIpvUvHits), seIpvUvHitsCrc: cycleOf(row.seIpvUvHits), freeClkRate: valueOf(row.freeClkRate), freeClkRateCrc: cycleOf(row.freeClkRate), payConvRate: valueOf(row.payConvRate), payConvRateCrc: cycleOf(row.payConvRate), payByrCnt: valueOf(row.payByrCnt), simWeight: valueOf(row.simWeight), simWeightCrc: cycleOf(row.simWeight) }));
  return { ...params, recordCount: inner.recordCount || words.length, words };
}

export async function wordCategory(cdpUrl, options = {}) {
  invariant(options.keyword, 'MISSING_ARGUMENT', 'Word category analysis requires --keyword.', { exitCode: 2 });
  const params = { ...commonWordParams(options, 'keyWord'), order: options.order || 'desc', orderBy: options.orderBy || 'clickHitsRatio', page: options.page || 1, pageSize: Math.min(options.pageSize || 10, MAX_PAGE_SIZE) };
  const body = await pageFetch(cdpUrl, { path: '/mc/mq/mkt/keyword/cate/analysis.json', params });
  const inner = body?.data || {};
  const categories = (inner.data || []).map((row) => ({ cateId: row.cateId, cateFullName: row.cateFullName, clickHitsRatio: valueOf(row.clickHitsRatio), freeClkRate: valueOf(row.freeClkRate) }));
  return { ...params, recordCount: inner.recordCount || categories.length, categories };
}
