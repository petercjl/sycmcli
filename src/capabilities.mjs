import { businessCapabilities, mutationCapabilities } from './business-capabilities.mjs';
import { listOperations } from './operation-registry.mjs';

export const capabilities = {
  schemaVersion: 1,
  package: '@petercjl/sycmcli',
  version: '0.3.0-next.0',
  safety: {
    authorizationBoundary: 'authorized-reads-and-confirmed-registered-writes',
    browserAuthentication: true,
    exportsCookies: false,
    stopsOnAuthenticationOrRiskChallenge: true,
    arbitraryEndpointsAllowed: false,
    mutationPlanRequired: true
  },
  coverage: { businessCapabilities: businessCapabilities.length, mutationCapabilities: mutationCapabilities.length, registeredReadOperations: listOperations().length },
  capabilities: [
    { id: 'sycm.store.manage', commands: ['stores add', 'stores list', 'stores use', 'stores show', 'auth login', 'auth status'] },
    { id: 'sycm.category.read', commands: ['category search', 'category tree', 'category main'] },
    { id: 'sycm.market.item_rank.read', commands: ['item rank'] },
    { id: 'sycm.market.price_segments.read', commands: ['price segments'] },
    { id: 'sycm.market.keyword_rank.read', commands: ['keyword rank'] },
    { id: 'sycm.market.search_word.read', commands: ['word overview', 'word trend', 'word related', 'word category'] },
    { id: 'business.catalog', commands: ['business list', 'business show'], count: businessCapabilities.length },
    { id: 'business.registered_data.read', commands: ['data operations', 'data run'], operationCount: listOperations().length },
    { id: 'business.analysis.local', commands: ['analyze run'], deterministic: true },
    { id: 'business.mutation.guard', commands: ['mutation plan', 'mutation show', 'mutation apply'], mutationCount: mutationCapabilities.length },
    { id: 'sycm.output.export', formats: ['json', 'csv', 'xlsx'] },
    { id: 'agent.skill.manage', commands: ['skill source', 'skill status', 'skill install', 'skill update'] },
    { id: 'package.update', commands: ['update status', 'update check', 'update install', 'update config'], default: 'automatic-daily' }
  ],
  adapters: {
    codex: { status: 'tested', tool: 'terminal + attached Chrome CDP', defaultCdpUrl: 'http://127.0.0.1:9223' },
    sealseek: { status: 'implemented-spec-compatible-user-test-pending', tool: 'terminal + native browser evaluate' }
  }
};
