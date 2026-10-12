import { CliError, invariant } from './errors.mjs';
import { runRegisteredOperation } from './data-runner.mjs';

const DATED_RESOURCES = new Set(['overview', 'categories', 'items']);

export function normalizeDmpOptions(resource, options = {}) {
  invariant(['date-range', 'overview', 'categories', 'items', 'standard-categories', 'labels', 'indicators'].includes(resource), 'UNKNOWN_COMMAND', `Unknown DMP shop resource: ${resource}`, { exitCode: 2 });
  const normalized = {};
  if (DATED_RESOURCES.has(resource)) {
    normalized.period = String(options.period ?? '7');
    invariant(['1', '7', '30'].includes(normalized.period), 'INVALID_ARGUMENT', '--period must be 1, 7, or 30.', { exitCode: 2 });
  }
  if (resource === 'overview') {
    normalized.benchmark = String(options.benchmark ?? '0');
    invariant(['0', '1'].includes(normalized.benchmark), 'INVALID_ARGUMENT', '--benchmark must be 0 or 1.', { exitCode: 2 });
  }
  if (resource === 'categories' || resource === 'items') {
    normalized.page = Number(options.page ?? 1);
    normalized.pageSize = Number(options.pageSize ?? (resource === 'items' ? 20 : 10));
    invariant(Number.isInteger(normalized.page) && normalized.page >= 1, 'INVALID_ARGUMENT', '--page must be a positive integer.', { exitCode: 2 });
    invariant(Number.isInteger(normalized.pageSize) && normalized.pageSize >= 1 && normalized.pageSize <= 100, 'INVALID_ARGUMENT', '--page-size must be an integer from 1 to 100.', { exitCode: 2 });
  }
  if (resource === 'standard-categories') {
    normalized.cateModel = String(options.cateModel ?? '2');
    normalized.filterModel = String(options.filterModel ?? '0');
  }
  if (resource === 'indicators') {
    normalized.type = String(options.type ?? '1');
    invariant(['1', '2', '4'].includes(normalized.type), 'INVALID_ARGUMENT', '--type must be 1, 2, or 4.', { exitCode: 2 });
  }
  if (resource === 'categories') for (const key of ['orderIndicator', 'orderType']) if (options[key] !== undefined) normalized[key] = String(options[key]);
  if (resource === 'items') {
    for (const key of ['keyword', 'potentialLevels', 'priceLevels', 'type', 'lifeStageCodes', 'itemLabels', 'cate1Id', 'cate2Id', 'leafCateId', 'orderIndicator', 'orderType', 'promotionFilterType']) {
      if (options[key] !== undefined && options[key] !== '') normalized[key] = String(options[key]);
    }
  }
  return normalized;
}

function responseData(result) {
  return result?.response?.data ?? null;
}

function dateRangeFrom(result) {
  const data = responseData(result);
  return { minDate: data?.minDate || null, maxDate: data?.maxDate || null };
}

export async function runDmpShopRead(cdpUrl, resource, options = {}, { runner = runRegisteredOperation } = {}) {
  const params = normalizeDmpOptions(resource, options);
  if (resource === 'date-range') {
    const result = await runner(cdpUrl, 'dmp.shop-date-range', {});
    return { resource, dateRange: dateRangeFrom(result) };
  }

  let dateRange = null;
  if (DATED_RESOURCES.has(resource)) {
    const rangeResult = await runner(cdpUrl, 'dmp.shop-date-range', {});
    dateRange = dateRangeFrom(rangeResult);
    if (!dateRange.maxDate) throw new CliError('DMP_DATE_UNAVAILABLE', 'DMP did not return an available maxDate.', { hint: 'Check the selected store authorization and whether this shop has DMP data.' });
    params.endDate = dateRange.maxDate;
  }

  const operation = {
    overview: 'dmp.shop-overview',
    categories: 'dmp.shop-categories',
    items: 'dmp.shop-items',
    'standard-categories': 'dmp.shop-standard-categories',
    labels: 'dmp.shop-labels',
    indicators: 'dmp.shop-item-indicators'
  }[resource];
  const result = await runner(cdpUrl, operation, params);
  const data = responseData(result);
  const base = { resource, ...(dateRange ? { dateRange, period: params.period } : {}) };
  if (resource === 'overview') return { ...base, benchmark: params.benchmark, overview: data };
  if (resource === 'categories') return { ...base, pager: data?.pager ?? null, categories: Array.isArray(data?.list) ? data.list : [] };
  if (resource === 'items') return { ...base, pager: data?.pager ?? null, items: Array.isArray(data?.list) ? data.list : [] };
  if (resource === 'standard-categories') return { ...base, categories: Array.isArray(data) ? data : [] };
  if (resource === 'labels') return { ...base, labels: Array.isArray(data) ? data : (Array.isArray(data?.list) ? data.list : []) };
  return { ...base, indicators: Array.isArray(data) ? data : [] };
}
