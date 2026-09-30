import fs from 'node:fs';
import { CliError } from './errors.mjs';
import { updateStore } from './config.mjs';
import { writeOutput } from './export.mjs';

export function buildHostBrowserScript(operation, options = {}) {
  const task = JSON.stringify({ operation, options });
  return `async () => (${hostBrowserTask.toString()})(${task})`;
}

export function completeHostResult(store, payload, { out, format, force = false } = {}) {
  if (!payload || payload.ok !== true) {
    const error = payload?.error || {};
    throw new CliError(error.code || 'HOST_BROWSER_FAILED', error.message || 'Host browser task failed.', { details: error.details, hint: error.hint });
  }
  const identity = payload.identity || {};
  if (!identity.stableId) throw new CliError('AUTH_REQUIRED', 'The host browser did not return a Shengyicanmou identity.');
  if (store.identity?.stableId && String(store.identity.stableId) !== String(identity.stableId)) {
    throw new CliError('STORE_IDENTITY_MISMATCH', `Store alias "${store.alias}" is bound to a different Shengyicanmou identity.`, { details: { expected: store.identity, actual: identity } });
  }
  if (!store.identity && !store.custom) updateStore(store.alias, { identity, lastAuthenticatedAt: new Date().toISOString() });
  const envelope = { ok: true, store: store.alias, identity, fetchedAt: new Date().toISOString(), data: payload.data };
  if (!out) return envelope;
  return writeOutput(payload.data, out, { format, force }).then((exported) => ({ ok: true, store: store.alias, export: exported }));
}

export function readHostPayload(input = process.stdin) {
  if (input.isTTY) throw new CliError('HOST_RESULT_REQUIRED', 'Pipe the host-browser evaluate result JSON to sycmcli host complete.');
  return new Promise((resolve, reject) => {
    let text = '';
    input.setEncoding('utf8');
    input.on('data', (chunk) => { text += chunk; });
    input.on('end', () => {
      try { resolve(JSON.parse(text)); } catch (error) { reject(new CliError('HOST_RESULT_INVALID', 'Host-browser result is not valid JSON.', { details: error.message })); }
    });
    input.on('error', reject);
  });
}

async function hostBrowserTask(task) {
  const MAX_PAGE_SIZE = 20;
  const DAY_MS = 86400000;
  const options = task.options || {};
  const valueOf = (field) => field && typeof field === 'object' && 'value' in field ? field.value : field;
  const cycleOf = (field) => field && typeof field === 'object' ? (field.cycleCrc ?? field.cycleCqc ?? null) : null;
  const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dateRange = (dateType = 'day') => {
    if (!['day', 'recent7', 'recent30'].includes(dateType)) throw Object.assign(new Error(`dateRange is required for ${dateType}`), { code: 'DATE_RANGE_REQUIRED' });
    const now = new Date();
    const offset = now.getHours() < 8 ? 1 : 0;
    const end = new Date(now.getTime() - (1 + offset) * DAY_MS);
    if (dateType === 'recent7') return `${formatDate(new Date(now.getTime() - (7 + offset) * DAY_MS))}|${formatDate(end)}`;
    if (dateType === 'recent30') return `${formatDate(new Date(now.getTime() - (30 + offset) * DAY_MS))}|${formatDate(end)}`;
    return `${formatDate(end)}|${formatDate(end)}`;
  };
  const identity = () => {
    const meta = globalThis.metaCacheData || globalThis.g_config || {};
    const result = {
      runAsShopId: meta.runAsShopId ?? null, runAsShopTitle: meta.runAsShopTitle ?? null,
      mainUserId: meta.mainUserId ?? null, mainUserName: meta.mainUserName ?? null,
      runAsUserId: meta.runAsUserId ?? null, runAsUserName: meta.runAsUserName ?? null,
      loginUserId: meta.loginUserId ?? null, loginUserName: meta.loginUserName ?? null
    };
    result.stableId = String(result.runAsShopId || result.runAsUserId || result.mainUserId || result.loginUserId || '');
    result.displayName = result.runAsShopTitle || result.runAsUserName || result.mainUserName || result.loginUserName || null;
    return result;
  };
  const api = async (path, params = {}, useToken = true) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) search.set(key, String(value));
    const meta = globalThis.metaCacheData || globalThis.g_config || {};
    const token = meta.legalityToken || meta.token || new URLSearchParams(location.search).get('token') || '';
    if (useToken && token) { search.set('_', String(Date.now())); search.set('token', token); }
    await new Promise((resolve) => setTimeout(resolve, 350 + Math.floor(Math.random() * 650)));
    const controller = new AbortController();
    const timeout = new Promise((resolve) => setTimeout(() => { controller.abort(); resolve({ timeout: true }); }, 20000));
    let response;
    try { response = await Promise.race([fetch(`${path}?${search}`, { credentials: 'include', headers: { Accept: 'application/json, text/plain, */*' }, signal: controller.signal }), timeout]); }
    catch (error) { throw Object.assign(new Error(error?.name === 'AbortError' ? 'SYCM request timed out.' : error.message), { code: error?.name === 'AbortError' ? 'SYCM_REQUEST_TIMEOUT' : 'SYCM_NETWORK_ERROR' }); }
    if (response?.timeout) throw Object.assign(new Error('SYCM request timed out.'), { code: 'SYCM_REQUEST_TIMEOUT' });
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error(`SYCM returned HTTP ${response.status}`), { code: [401, 403].includes(response.status) ? 'AUTH_OR_RISK_CHALLENGE' : 'SYCM_HTTP_ERROR' });
    if (!contentType.includes('json') && /login|登录|验证码|滑块|安全验证|punish/i.test(text)) throw Object.assign(new Error('SYCM requested login or risk verification.'), { code: 'AUTH_OR_RISK_CHALLENGE' });
    let body;
    try { body = JSON.parse(text); } catch { throw Object.assign(new Error('SYCM did not return JSON.'), { code: 'SYCM_INVALID_RESPONSE' }); }
    if (body?.code !== undefined && Number(body.code) !== 0) throw Object.assign(new Error(body.message || body.msg || `SYCM API code=${body.code}`), { code: 'SYCM_API_ERROR', details: { apiCode: body.code } });
    return body;
  };
  const categoryRows = (body) => (Array.isArray(body?.data) ? body.data : []).map((row) => ({ parentCateId: row[0], cateId: row[1], cateName: row[2], cateFlag: row[3], marketVersion: row[4], isLeaf: row[5] === 'Y', cateLevel1Id: row[6], cateLevel1Name: row[7] }));
  const tree = async () => ({ categories: categoryRows(await api('/mc/common/free/getCateInfo.json', { marketVersion: 'free' }, false)) });
  const main = async () => {
    const body = await api('/portal/shop/getMainCateInfo.json', {}, false);
    const data = body?.content?.data || body?.data || {};
    return { cateLevel1Id: data.cateLevel1Id ?? null, cateLevel1Name: data.cateLevel1Name ?? null, cateId: data.cateId ?? data.cateLevel2Id ?? null, cateName: data.cateName ?? data.cateLevel2Name ?? null };
  };
  const resolveCategory = async () => {
    if (options.cateId) return String(options.cateId);
    const [{ categories }, primary] = await Promise.all([tree(), main().catch(() => ({}))]);
    const row = categories.find((item) => String(item.cateLevel1Id) === String(primary.cateLevel1Id) && Number(item.cateFlag) === 2) || categories.find((item) => Number(item.cateFlag) === 2) || categories.find((item) => item.isLeaf);
    if (!row) throw Object.assign(new Error('No market category is available.'), { code: 'CATEGORY_UNAVAILABLE' });
    return String(row.cateId);
  };
  const normalizeItem = (row) => {
    const get = (key) => valueOf(row?.[key]); const item = row?.item || {}; const shop = row?.shop || {};
    return { rank: get('cateRankId') ?? get('rn') ?? get('rank') ?? null, rankCycleCqc: cycleOf(row?.cateRankId) ?? cycleOf(row?.rn) ?? cycleOf(row?.rank), itemId: get('itemId') ?? item.itemId ?? null, title: item.title ?? get('title') ?? null, pictUrl: item.pictUrl ?? get('pictUrl') ?? null, detailUrl: item.detailUrl ?? get('detailUrl') ?? null, itemUserId: item.userId ?? get('userId') ?? null, sellerId: get('sellerId') ?? null, shopTitle: shop.title ?? get('shopTitle') ?? null, shopUrl: shop.shopUrl ?? get('shopUrl') ?? null, shopPictureUrl: shop.pictureUrl ?? get('shopPictureUrl') ?? null, shopUserId: shop.userId ?? get('shopUserId') ?? null, b2CShop: shop.b2CShop ?? get('b2CShop') ?? null, coreKeywords: get('coreKeyWord') ?? get('coreKeywords') ?? null, payByrCnt: get('payByrCnt') ?? null, uv: get('uv') ?? null, searchUv: get('searchUv') ?? null, cartByrCnt: get('cartByrCnt') ?? null, cltByrCnt: get('cltByrCnt') ?? null, isMonitor: get('isMonitor') ?? null, isSelfItem: get('isSelfItem') ?? null };
  };
  try {
    if (location.host !== 'sycm.taobao.com') throw Object.assign(new Error('Open and log in to sycm.taobao.com first.'), { code: 'AUTH_REQUIRED' });
    const who = identity();
    if (!who.stableId) throw Object.assign(new Error('Shengyicanmou login identity is unavailable.'), { code: 'AUTH_REQUIRED' });
    let data;
    if (task.operation === 'category-tree') {
      const result = await tree(); data = { recordCount: result.categories.length, categories: result.categories };
    } else if (task.operation === 'category-main') data = await main();
    else if (task.operation === 'category-search') {
      if (!options.keyword) throw Object.assign(new Error('keyword is required'), { code: 'MISSING_ARGUMENT' });
      const result = await tree(); const all = result.categories; const byId = new Map(all.map((row) => [String(row.cateId), row])); const term = String(options.keyword).trim().toLowerCase();
      const fullName = (node) => { const names = []; const seen = new Set(); let current = node; while (current && !seen.has(String(current.cateId))) { seen.add(String(current.cateId)); names.unshift(current.cateName); const parent = String(current.parentCateId ?? ''); if (!parent || parent === '0') break; current = byId.get(parent); } return names.join(' > '); };
      let rows = all.filter((row) => (!options.leafOnly || row.isLeaf) && (options.cateLevel1Id === undefined || String(row.cateLevel1Id) === String(options.cateLevel1Id)) && (options.exact ? String(row.cateName || '').toLowerCase() === term : String(row.cateName || '').toLowerCase().includes(term))).map((row) => ({ ...row, cateFullName: fullName(row) }));
      if (options.limit) rows = rows.slice(0, options.limit); data = { recordCount: rows.length, categories: rows };
    } else if (task.operation === 'item-rank') {
      const rankType = options.rankType || 'gmv'; const cateId = await resolveCategory(); const dateType = options.dateType || 'recent7'; const range = options.dateRange || dateRange(dateType); const page = options.page || 1; const requestedPageSize = options.pageSize || 10; const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE); const top = options.top || 0; const maxPages = options.maxPages || (top ? Math.ceil(top / pageSize) : 1);
      const config = rankType === 'flow' ? ['/mc/mq/mkt/item/offline/rank/search.json', 'uv,searchUv', true] : rankType === 'add' ? ['/mc/mq/mkt/item/offline/rank/purpose.json', 'cartByrCnt,cltByrCnt,uv', true] : rankType === 'newitm_ipv' ? ['/mc/mq/mkt/item/offline/rank.json', 'uv,payByrCnt,cartByrCnt', false] : ['/mc/mq/mkt/item/offline/rank.json', 'payByrCnt,uv', false];
      const items = []; const seen = new Set(); let recordCount = 0; let duplicateCount = 0; let stoppedBy = 'maxPages'; let fetchedPages = 0;
      for (let offset = 0; offset < maxPages; offset += 1) { const currentPage = page + offset; const params = { dateRange: range, dateType, pageSize, page: currentPage, cateId, rankType, minPrice: options.minPrice || '', maxPrice: options.maxPrice || '', priceSeg: ['all', 'customizePrice'].includes(options.priceSeg) ? '' : (options.priceSeg || ''), sellerType: options.sellerType ?? '-1', keyWord: options.keyword || '', cateFlag: options.cateFlag ?? '2', indexCode: options.indexCode || config[1], marketVersion: 'free' }; if (config[2] || options.order !== undefined) params.order = options.order || ''; if (config[2] || options.orderBy !== undefined) params.orderBy = options.orderBy || ''; const body = await api(config[0], params); fetchedPages += 1; const inner = body?.data || {}; const rows = Array.isArray(inner) ? inner : (Array.isArray(inner.data) ? inner.data : []); recordCount = Number(inner.recordCount || recordCount || rows.length); if (!rows.length) { stoppedBy = 'emptyPage'; break; } for (const row of rows) { const normalized = normalizeItem(row); const key = String(normalized.itemId || `${currentPage}:${items.length}`); if (seen.has(key)) { duplicateCount += 1; continue; } seen.add(key); items.push(normalized); if (top && items.length >= top) { stoppedBy = 'targetTopN'; break; } } if (stoppedBy === 'targetTopN') break; if (rows.length < pageSize) { stoppedBy = 'shortPage'; break; } }
      data = { cateId, dateRange: range, dateType, rankType, page, pageSize, requestedPageSize, targetTopN: top || null, maxPages, fetchedPages, stoppedBy, returnedCount: items.length, recordCount, duplicateCount, warnings: requestedPageSize > MAX_PAGE_SIZE ? [`page-size ${requestedPageSize} was capped at ${MAX_PAGE_SIZE}.`] : [], items };
    } else if (task.operation === 'price-segments') {
      const cateId = await resolveCategory(); const dateType = options.dateType || 'recent7'; const range = options.dateRange || dateRange(dateType); const sellerType = options.sellerType ?? '0'; const body = await api('/mc/mq/mkt/priceSeg/list.json', { dateRange: range, dateType, cateId, sellerType, marketVersion: 'free' }); const rows = (Array.isArray(body?.data) ? body.data : []).map((row) => ({ priceSegId: valueOf(row.priceSegId), priceSegName: valueOf(row.priceSegName), label: valueOf(row.priceSegName), value: valueOf(row.priceSegId) })); data = { cateId, dateRange: range, dateType, sellerType, recordCount: rows.length, priceSegs: rows };
    } else if (task.operation === 'keyword-rank') {
      const cateId = await resolveCategory(); const dateType = options.dateType || 'day'; const params = { cateId, dateRange: options.dateRange || dateRange(dateType), dateType, device: options.device || '0', keyWord: options.keyword || '', kwType: options.kwType || 'search', marketVersion: 'free', order: options.order || 'desc', orderBy: options.orderBy || 'seIpvUvHits', page: options.page || 1, pageSize: Math.min(options.pageSize || 10, MAX_PAGE_SIZE), rankType: options.rankType || 'hot' }; const body = await api('/mc/mq/mkt/keyword/rank/pro.json', params); const inner = body?.data || {}; const words = (inner.data || []).map((row) => ({ searchWord: valueOf(row.searchWord), rank: valueOf(row.rn), seIpvUvHits: valueOf(row.seIpvUvHits), seIpvUvHitsCrc: cycleOf(row.seIpvUvHits), clickUv: valueOf(row.clickUv), clickThroughRate: valueOf(row.clickThroughRate), payRate: valueOf(row.payRate) })); data = { cateId, ...params, recordCount: inner.recordCount || words.length, words };
    } else {
      if (!options.keyword) throw Object.assign(new Error('keyword is required'), { code: 'MISSING_ARGUMENT' }); const dateType = options.dateType || 'day'; const base = { dateRange: options.dateRange || dateRange(dateType), dateType, device: options.device || '0', marketVersion: 'free' };
      if (task.operation === 'word-overview') { const body = await api('/mc/free/searchword/overview.json', { ...base, keyword: options.keyword }, false); const row = body?.data || {}; data = { keyword: options.keyword, dateRange: base.dateRange, dateType, seIpvUvHits: valueOf(row.seIpvUvHits), seIpvUvHitsCrc: cycleOf(row.seIpvUvHits), clickRateSec: valueOf(row.clickRateSec), clickRateSecCrc: cycleOf(row.clickRateSec), payConvRate: valueOf(row.payConvRate), payConvRateCrc: cycleOf(row.payConvRate), payOrdByrCnt: valueOf(row.payOrdByrCnt), payOrdByrCntCrc: cycleOf(row.payOrdByrCnt) }; }
      else if (task.operation === 'word-trend') { const body = await api('/mc/free/searchword/propertyTrend.json', { ...base, keyword: options.keyword }, false); data = { keyword: options.keyword, dateRange: base.dateRange, dateType, trend: body?.data ?? null }; }
      else if (task.operation === 'word-related') { const params = { ...base, keyWord: options.keyword, cycleFlag: options.cycleFlag || 'cycle', order: options.order || 'desc', orderBy: options.orderBy || 'seIpvUvHits', page: options.page || 1, pageSize: Math.min(options.pageSize || 10, MAX_PAGE_SIZE), rankType: options.rankType || 'related' }; const body = await api('/mc/mq/mkt/keyword/relate/analysis.json', params); const inner = body?.data || {}; const words = (inner.data || []).map((row) => ({ keyword: valueOf(row.relatedSekeyword), seIpvUvHits: valueOf(row.seIpvUvHits), seIpvUvHitsCrc: cycleOf(row.seIpvUvHits), freeClkRate: valueOf(row.freeClkRate), freeClkRateCrc: cycleOf(row.freeClkRate), payConvRate: valueOf(row.payConvRate), payConvRateCrc: cycleOf(row.payConvRate), payByrCnt: valueOf(row.payByrCnt), simWeight: valueOf(row.simWeight), simWeightCrc: cycleOf(row.simWeight) })); data = { ...params, recordCount: inner.recordCount || words.length, words }; }
      else if (task.operation === 'word-category') { const params = { ...base, keyWord: options.keyword, order: options.order || 'desc', orderBy: options.orderBy || 'clickHitsRatio', page: options.page || 1, pageSize: Math.min(options.pageSize || 10, MAX_PAGE_SIZE) }; const body = await api('/mc/mq/mkt/keyword/cate/analysis.json', params); const inner = body?.data || {}; const categories = (inner.data || []).map((row) => ({ cateId: row.cateId, cateFullName: row.cateFullName, clickHitsRatio: valueOf(row.clickHitsRatio), freeClkRate: valueOf(row.freeClkRate) })); data = { ...params, recordCount: inner.recordCount || categories.length, categories }; }
      else throw Object.assign(new Error(`Unknown operation: ${task.operation}`), { code: 'UNKNOWN_OPERATION' });
    }
    return { ok: true, identity: who, data };
  } catch (error) {
    return { ok: false, error: { code: error?.code || 'HOST_BROWSER_FAILED', message: error?.message || String(error), ...(error?.details ? { details: error.details } : {}) } };
  }
}
