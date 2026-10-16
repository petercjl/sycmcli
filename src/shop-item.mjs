import { invariant } from './errors.mjs';
import { runRegisteredOperation } from './data-runner.mjs';
import { buildDateRange } from './sycm.mjs';

function responseData(result) {
  const body = result?.response ?? result;
  return body?.data ?? body?.content?.data ?? null;
}

function valueOf(value) {
  return value && typeof value === 'object' && 'value' in value ? value.value : value;
}

function withoutPrivateIdentity(value) {
  if (Array.isArray(value)) return value.map(withoutPrivateIdentity);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['sellerId', 'userId'].includes(key))
    .map(([key, entry]) => [key, withoutPrivateIdentity(entry)]));
}

function itemDateParams(options = {}, now = new Date()) {
  const dateType = options.dateType || 'recent7';
  invariant(['day', 'recent7', 'recent30'].includes(dateType), 'INVALID_ARGUMENT', '--date-type must be day, recent7, or recent30.', { exitCode: 2 });
  invariant(options.itemId, 'MISSING_ARGUMENT', 'Shop item detail requires --item-id.', { exitCode: 2 });
  return { itemId: String(options.itemId), dateType, dateRange: options.dateRange || buildDateRange(dateType, now) };
}

function metricObject(data, omitted = []) {
  const blocked = new Set(['itemId', 'sellerId', 'userId', 'statDate', ...omitted]);
  return Object.fromEntries(Object.entries(data).filter(([key]) => !blocked.has(key)).map(([key, value]) => [key, withoutPrivateIdentity(value)]));
}

export function normalizeItemOverview(result, request) {
  const data = responseData(result);
  invariant(data && typeof data === 'object' && !Array.isArray(data), 'SYCM_DATA_MISSING', 'Shop item overview data is unavailable.');
  return { itemId: request.itemId, dateType: request.dateType, dateRange: request.dateRange, statDate: valueOf(data.statDate) ?? null, metrics: metricObject(data) };
}

export function normalizeItemDiagnosis(result, request) {
  const data = responseData(result);
  invariant(data && typeof data === 'object' && !Array.isArray(data), 'SYCM_DATA_MISSING', 'Shop item diagnosis data is unavailable.');
  return { itemId: request.itemId, dateType: request.dateType, dateRange: request.dateRange, statDate: valueOf(data.statDate) ?? null, focusMetric: valueOf(data.indexName) ?? null, focusDifference: valueOf(data.indexRelaDiff) ?? null, metrics: metricObject(data, ['indexName', 'indexRelaDiff', 'dateType', 'crowdType', 'userType']) };
}

export function normalizeItemDetail(overviewResult, listResult, request) {
  const overview = responseData(overviewResult);
  const modules = responseData(listResult);
  invariant(overview && typeof overview === 'object' && !Array.isArray(overview), 'SYCM_DATA_MISSING', 'Shop item detail overview is unavailable.');
  invariant(Array.isArray(modules), 'SYCM_DATA_MISSING', 'Shop item detail modules are unavailable.');
  return { itemId: request.itemId, dateType: request.dateType, dateRange: request.dateRange, statDate: valueOf(overview.statDate) ?? null, overview: metricObject(overview), modules: withoutPrivateIdentity(modules) };
}

function flattenChannels(rows, level = 1, parentPageId = null, output = []) {
  for (const row of rows) {
    const safe = withoutPrivateIdentity(row);
    const children = Array.isArray(safe.children) ? safe.children : [];
    const { children: _children, ...channel } = safe;
    output.push({ ...channel, level: Number(valueOf(channel.pageLevel) ?? level), parentPageId: valueOf(channel.pPageId) ?? parentPageId });
    flattenChannels(children, level + 1, valueOf(channel.pageId) ?? parentPageId, output);
  }
  return output;
}

export function normalizeItemFlow(result, request) {
  const tree = responseData(result);
  invariant(Array.isArray(tree), 'SYCM_DATA_MISSING', 'Shop item flow-source data is unavailable.');
  const safeTree = withoutPrivateIdentity(tree);
  return { itemId: request.itemId, dateType: request.dateType, dateRange: request.dateRange, tree: safeTree, channels: flattenChannels(safeTree) };
}

export function normalizeItemGallery(result, request) {
  const payload = responseData(result);
  const materials = payload?.data ?? payload?.materials;
  invariant(payload && typeof payload === 'object' && Array.isArray(materials), 'SYCM_DATA_MISSING', 'Shop item gallery material data is unavailable.');
  return {
    itemId: request.itemId,
    dateType: request.dateType,
    dateRange: request.dateRange,
    recordCount: valueOf(payload.recordCount) ?? materials.length,
    materials: withoutPrivateIdentity(materials)
  };
}

export async function shopItemOverview(cdpUrl, options = {}, runner = runRegisteredOperation) {
  const request = itemDateParams(options);
  return normalizeItemOverview(await runner(cdpUrl, 'item.sale-overview', request), request);
}

export async function shopItemDiagnose(cdpUrl, options = {}, runner = runRegisteredOperation) {
  const request = itemDateParams(options);
  return normalizeItemDiagnosis(await runner(cdpUrl, 'item.diagnose-core', { ...request, crowdType: String(options.crowdType || 'all') }), request);
}

export async function shopItemDetail(cdpUrl, options = {}, runner = runRegisteredOperation) {
  const request = itemDateParams(options);
  const params = { ...request, byrType: String(options.byrType || 'all') };
  const overview = await runner(cdpUrl, 'item.detail-overview', params);
  const modules = await runner(cdpUrl, 'item.detail-list', params);
  return normalizeItemDetail(overview, modules, request);
}

export async function shopItemFlow(cdpUrl, options = {}, runner = runRegisteredOperation) {
  const request = itemDateParams(options);
  const result = await runner(cdpUrl, 'item.flow-source-tree-v3', { ...request, device: String(options.device ?? '2'), page: Number(options.page || 1), pageSize: Number(options.pageSize || 10) });
  return normalizeItemFlow(result, request);
}

export async function shopItemGallery(cdpUrl, options = {}, runner = runRegisteredOperation) {
  const request = itemDateParams(options);
  const result = await runner(cdpUrl, 'item.main-pic-material', {
    ...request,
    byrType: String(options.byrType || 'all'),
    orderBy: String(options.orderBy || 'itemExposeUv'),
    order: String(options.order || 'desc'),
    page: Number(options.page || 1),
    pageSize: Number(options.pageSize || 10),
    contentType: String(options.contentType || ''),
    indexCode: String(options.indexCode || 'itemExposeUv,itemInteractUv,itemPayUv,itemLossUv,itemLossRate,itemPayConvertRate')
  });
  return normalizeItemGallery(result, request);
}
