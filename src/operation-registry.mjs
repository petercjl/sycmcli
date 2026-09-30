import { CliError, invariant } from './errors.mjs';

const operations = [
  ['competitor.core-indexes', 'sycm', 'GET', '/mc/mq/rivalItem/analysis/getCoreIndexes.json', ['itemId', 'rivalItemId', 'dateRange']],
  ['competitor.core-trend', 'sycm', 'GET', '/mc/mq/rivalItem/analysis/getCoreTrend.json', ['itemId', 'rivalItemId', 'dateRange']],
  ['competitor.search', 'sycm', 'GET', '/mc/ci/free/index/rival/item/search.json', ['keyWord']],
  ['competitor.recommend', 'sycm', 'GET', '/mc/free/rivalShop/recommend/index/item.json', ['itemId']],
  ['competitor.flow-origin', 'sycm', 'GET', '/mc/rivaItem/analysis/getFlowSource/origin/v4/free.json', ['itemId', 'rivalItemId', 'dateRange']],
  ['competitor.flow-paid', 'sycm', 'GET', '/mc/rivalItem/getFlowsource/qzt/participate/free.json', ['itemId', 'rivalItemId', 'dateRange']],
  ['competitor.flow-source', 'sycm', 'GET', '/mc/mq/rivalItem/analysis/getFlowSource/v4.json', ['itemId', 'rivalItemId', 'dateRange']],
  ['competitor.search-words', 'sycm', 'GET', '/mc/mq/rivalItem/analysis/getSearchWords.json', ['itemId', 'rivalItemId', 'dateRange']],
  ['alimama.access', 'alimama', 'POST', '/member/checkAccess.json', [], { encoding: 'json', defaultParams: { bizCode: 'universalBP' } }],
  ['alimama.campaigns', 'alimama', 'POST', '/campaign/horizontal/findPage.json', [], { encoding: 'json' }],
  ['alimama.multi-target-campaigns', 'alimama', 'POST', '/campaign/onebpSite/multiTargCampaignFindPage.json', [], { encoding: 'json' }],
  ['alimama.member-config', 'alimama', 'POST', '/member/getMemberConfig.json', [], { encoding: 'json' }],
  ['alimama.report-config', 'alimama', 'POST', '/report/getReportConfig.json', [], { encoding: 'json' }],
  ['alimama.report', 'alimama', 'POST', '/report/query.json', [], { encoding: 'json' }],
  ['alimama.effect-prediction', 'alimama', 'POST', '/algo/listEffectPrediction.json', [], { encoding: 'json' }],
  ['alimama.budget-suggestion', 'alimama', 'POST', '/algo/getBatchBudgetSuggestion.json', [], { encoding: 'json' }]
];

const sycmItemOperations = [
  ['item.category-search', '/cc/common/category/getStdCate.json', ['keyWord']],
  ['item.diagnose-core', '/cc/diagnose/coreIndex.json', ['itemId', 'dateRange']],
  ['item.profile', '/cc/item/archive/profile.json', ['itemId']],
  ['item.detail-list', '/cc/item/detail/analysis/list.json', ['itemId', 'dateRange']],
  ['item.loss-overview', '/cc/item/detail/analysis/loss/overview.json', ['itemId', 'dateRange']],
  ['item.detail-overview', '/cc/item/detail/analysis/overview.json', ['itemId', 'dateRange']],
  ['item.main-pic-material', '/cc/item/detail/main/pic/analysis/material.json', ['itemId']],
  ['item.rank-live', '/cc/item/live/view/top.json', []],
  ['item.price-info', '/cc/item/price/info.json', ['itemId']],
  ['item.sale-overview', '/cc/item/sale/overview.json', ['itemId', 'dateRange']],
  ['item.title-trend', '/cc/item/title/v2/diagnosis/trend.json', ['itemId', 'dateRange']],
  ['item.title-score', '/cc/item/title/v2/titleScore.json', ['itemId']],
  ['item.title-word-list', '/cc/item/title/v2/word/list.json', ['itemId', 'dateRange']],
  ['item.title-word-recommend', '/cc/item/title/v2/word/recommend.json', ['itemId']],
  ['item.title-words', '/cc/item/v2/getTitleWords.json', ['itemId', 'dateRange']],
  ['item.dmp-product', '/cc/item/view/dmp/newproduct.json', ['itemId', 'dateRange']],
  ['item.dmp-product-top', '/cc/item/view/dmp/newproduct/top.json', ['itemIdList', 'dateRange']],
  ['item.rank', '/cc/item/view/top.json', []],
  ['item.sale-live-overview', '/cc/live/item/sale/overview.json', ['itemId']],
  ['item.sale-live-attributes', '/cc/live/item/sale/sku/attrDetail.json', ['itemId']],
  ['item.sale-live-skus', '/cc/live/v2/item/sale/sku/list.json', ['itemId']],
  ['item.rank-long-period', '/cc/long/period/nodistinct/item/view/top.json', ['dateRange']],
  ['item.refund-skus', '/cc/refund/item/sku/list.json', ['itemId', 'dateRange']],
  ['item.super-sku-overview', '/cc/supersku/overview.json', ['itemId', 'dateRange']],
  ['item.refund-close-overview', '/csp/api/refund/item/close/overview.json', ['itemId', 'dateRange']],
  ['item.refund-live-overview', '/csp/api/refund/item/live/overview.json', ['itemId']],
  ['item.refund-live-trend', '/csp/api/refund/item/live/trend.json', ['itemId']],
  ['item.refund-reasons', '/csp/api/refund/item/reason/list/v2.json', ['itemId', 'dateRange']],
  ['item.refund-live-warnings', '/csp/api/refund/item/warn/live.json', ['itemId']],
  ['item.flow-source-tree', '/flow/item/source/tree/support.json', ['itemId', 'dateRange']],
  ['item.flow-source-tree-v3', '/flow/v6/item/crowdtype/source/v3.json', ['itemId', 'dateRange']],
  ['item.customer-loss-risk', '/mc/item/customers/lossrisk.json', ['itemId', 'dateRange']],
  ['item.loss-rank', '/mc/item/detail/analysis/loss/rank.json', ['itemId', 'dateRange']],
  ['item.price-band', '/mc/item/price/band/info/v3.json', ['itemId', 'dateRange']],
  ['item.aftersales-trend', '/qos/aftersales/item/trend.json', ['itemId', 'dateRange']]
].map(([id, path, requiredParams]) => [id, 'sycm', 'GET', path, requiredParams]);

const sycmCompetitionOperations = [
  ['competition.active-status', '/mc/ci/free/active/status.json', []],
  ['competition.valid-group', '/mc/ci/free/config/rival/group/hasValidGroup.json', []],
  ['competition.group-items', '/mc/ci/free/config/rival/group/listItemsBySourceType.json', ['sourceType']],
  ['competition.monitored-shops-excluding-great', '/mc/ci/free/config/rival/shop/getMonitoredListExcludeGreatShop.json', []],
  ['competition.item-monitor-list', '/mc/ci/free/item/monitor/list/page.json', []],
  ['competition.item-state', '/mc/ci/free/item/state.json', ['itemId']],
  ['competition.shop-monitor-list', '/mc/ci/free/v2/shop/monitor/listShop/page.json', []],
  ['competition.search-drain-detail', '/mc/free/ci/item/search/drain/detail.json', ['itemId', 'dateRange']],
  ['competition.search-drain-recognition', '/mc/free/ci/item/search/drain/recognition.json', ['dateRange']],
  ['competition.view-drain-detail', '/mc/free/ci/item/view/drain/detail.json', ['itemId', 'dateRange']],
  ['competition.view-drain-recognition', '/mc/free/ci/item/view/drain/recognition.json', ['dateRange']],
  ['competition.item-monitor-list-live', '/mc/free/live/ci/item/monitor/list/page.json', []],
  ['competition.shop-monitor-list-live', '/mc/free/live/ci/shop/monitor/listShop/page.json', []],
  ['competitor.shop-core-live', '/mc/free/rivalShop/analysis/getCoreIndexesLive.json', ['sellerId']],
  ['competitor.shop-trend-live', '/mc/free/rivalShop/analysis/getCoreTrendLive.json', ['sellerId']],
  ['competitor.shop-top-items-live', '/mc/free/rivalShop/analysis/getLiveTopItems/page.json', ['sellerId']],
  ['competitor.shop-highlight', '/mc/mq/mkt/offline/rival/highlight.json', ['sellerId', 'dateRange']],
  ['competitor.shop-operation-summary', '/mc/mq/mkt/offline/rival/operation/summary.json', ['sellerId', 'dateRange']],
  ['competitor.shop-strategy', '/mc/mq/mkt/offline/rival/strategy.json', ['sellerId', 'dateRange']],
  ['competitor.group-core-indexes', '/mc/mq/rivalItem/analysis/group/getCoreIndexes.json', ['groupId', 'dateRange']],
  ['competitor.shop-core', '/mc/mq/rivalShop/analysis/getCoreIndexes.json', ['sellerId', 'dateRange']],
  ['competitor.shop-trend', '/mc/mq/rivalShop/analysis/getCoreTrend.json', ['sellerId', 'dateRange']],
  ['competitor.shop-flow-source', '/mc/mq/rivalShop/analysis/getFlowSource/v4.json', ['sellerId', 'dateRange']],
  ['competitor.shop-search-words', '/mc/mq/rivalShop/analysis/getSearchWords.json', ['sellerId', 'dateRange']],
  ['competitor.shop-crowd', '/mc/mq/rivalShop/analysis/getShopCrowd.json', ['sellerId', 'dateRange']],
  ['competitor.shop-top-items', '/mc/mq/rivalShop/analysis/getTopItems/page.json', ['sellerId', 'dateRange']],
  ['competitor.shop-profile-check', '/mc/mq/rivalShop/checkProfile.json', ['sellerId']],
  ['competitor.shop-profile', '/mc/mq/rivalShop/profile/detail.json', ['sellerId']],
  ['competitor.shop-flow-origin', '/mc/rivalShop/analysis/getFlowSource/origin/v4/free.json', ['sellerId', 'dateRange']],
  ['competitor.shop-flow-overview', '/mc/rivalShop/analysis/getFlowSource/overview/v4.json', ['sellerId', 'dateRange']],
  ['competitor.shop-flow-paid', '/mc/rivalShop/getFlowsource/qzt/participate/free.json', ['sellerId', 'dateRange']]
].map(([id, path, requiredParams]) => [id, 'sycm', 'GET', path, requiredParams]);

operations.push(...sycmItemOperations, ...sycmCompetitionOperations);

operations.push(
  ['dmp.shop-standard-categories', 'dmp', 'GET', '/api/dmp/shop/std/cate', []],
  ['dmp.shop-categories', 'dmp', 'GET', '/api/goods/cate/list', []],
  ['dmp.shop-date-range', 'dmp', 'GET', '/api/goods/shop/dateRange', []],
  ['dmp.shop-item-indicators', 'dmp', 'GET', '/api/goods/shop/item/indicators', []],
  ['dmp.shop-items', 'dmp', 'GET', '/api/goods/shop/item/list', []],
  ['dmp.shop-labels', 'dmp', 'GET', '/api/goods/shop/label/list', []],
  ['dmp.shop-overview', 'dmp', 'GET', '/api/goods/shop/v3/overview', []]
);

operations.push(
  ['coupon.page-detail', 'coupon', 'GET', '/consumercoupon/renderCouponPageDetailView.do', []],
  ['coupon.fee-init', 'coupon', 'GET', '/consumercoupon/getFeeInitInfo.do', []],
  ['coupon.fee-groups', 'coupon', 'GET', '/consumercoupon/getFeeGroupList.do', ['startTime', 'endTime']],
  ['coupon.fee-rule', 'coupon', 'GET', '/consumercoupon/getFeeRuleInfo.do', ['date']],
  ['coupon.fee-rules', 'coupon', 'GET', '/consumercoupon/getFeeRuleInfoList.do', ['startTime', 'endTime']],
  ['coupon.day-fee-summary', 'coupon', 'GET', '/consumercoupon/getDayFeeInfo.do', ['time']],
  ['coupon.day-fee-detail', 'coupon', 'GET', '/consumercoupon/getDayFeeInfoDetail.do', ['time']],
  ['coupon.day-fee-list', 'coupon', 'GET', '/consumercoupon/getDayFeeInfoListV2.do', ['startTime', 'endTime']],
  ['coupon.detail-day-list', 'coupon', 'GET', '/consumercoupon/getDayVOList.do', ['startTime', 'endTime']],
  ['coupon.download-tasks', 'coupon', 'GET', '/list/asyncTaskList/queryListData.do', ['processorKey', 'domainId']]
);

const services = {
  sycm: { origin: 'https://sycm.taobao.com', entryUrl: 'https://sycm.taobao.com/mc/mq/market_monitor.htm', hosts: ['sycm.taobao.com'], tokenStrategy: 'sycm-meta' },
  alimama: { origin: 'https://one.alimama.com', entryUrl: 'https://one.alimama.com/', hosts: ['one.alimama.com'], tokenStrategy: 'alimama-access' },
  dmp: { origin: 'https://dmp.advgateway.taobao.com', entryUrl: 'https://dmp.taobao.com/index_new.html#!/items/shop-insight', hosts: ['dmp.taobao.com'], tokenStrategy: 'dmp-magix' },
  coupon: { origin: 'https://sale.taobao.com', entryUrl: 'https://myseller.taobao.com/home.htm/coupon_marketing/home?tab=fee', hosts: ['myseller.taobao.com', 'sale.taobao.com'], matchPath: '/home.htm/coupon_marketing/', tokenStrategy: 'taobao-cookie' }
};

export const operationRegistry = Object.freeze(Object.fromEntries(operations.map(([id, service, method, path, requiredParams, options = {}]) => [id, {
  id, service, method, path, requiredParams, sideEffect: 'none', ...options
}])));

export function getService(id) {
  const service = services[id];
  if (!service) throw new CliError('UNKNOWN_SERVICE', `Unknown browser service: ${id}`, { exitCode: 2 });
  return service;
}

export function getOperation(id) {
  const operation = operationRegistry[id];
  if (!operation) throw new CliError('UNKNOWN_OPERATION', `Unknown registered operation: ${id}`, { exitCode: 2, hint: 'Run sycmcli data operations.' });
  return operation;
}

export function validateOperationParams(operation, params) {
  invariant(params && typeof params === 'object' && !Array.isArray(params), 'INVALID_ARGUMENT', 'Operation params must be a JSON object.', { exitCode: 2 });
  const missing = operation.requiredParams.filter((key) => params[key] === undefined || params[key] === null || params[key] === '');
  invariant(missing.length === 0, 'MISSING_ARGUMENT', `Missing operation parameters: ${missing.join(', ')}.`, { exitCode: 2 });
  return params;
}

export function listOperations() {
  return Object.values(operationRegistry).map((operation) => ({ ...operation, ...getService(operation.service), origin: getService(operation.service).origin }));
}
