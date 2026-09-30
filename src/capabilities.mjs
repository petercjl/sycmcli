export const capabilities = {
  schemaVersion: 1,
  package: '@petercjl/sycmcli',
  version: '0.1.0',
  safety: {
    authorizationBoundary: 'read-only',
    browserAuthentication: true,
    exportsCookies: false,
    stopsOnAuthenticationOrRiskChallenge: true
  },
  capabilities: [
    { id: 'sycm.store.manage', commands: ['stores add', 'stores list', 'stores use', 'stores show', 'auth login', 'auth status'] },
    { id: 'sycm.category.read', commands: ['category search', 'category tree', 'category main'] },
    { id: 'sycm.market.item_rank.read', commands: ['item rank'] },
    { id: 'sycm.market.price_segments.read', commands: ['price segments'] },
    { id: 'sycm.market.keyword_rank.read', commands: ['keyword rank'] },
    { id: 'sycm.market.search_word.read', commands: ['word overview', 'word trend', 'word related', 'word category'] },
    { id: 'sycm.output.export', formats: ['json', 'csv', 'xlsx'] },
    { id: 'agent.skill.manage', commands: ['skill source', 'skill status', 'skill install', 'skill update'] }
  ],
  adapters: {
    codex: { status: 'tested', tool: 'terminal' },
    sealseek: { status: 'implemented-spec-compatible-not-tested', tool: 'shell' }
  }
};
