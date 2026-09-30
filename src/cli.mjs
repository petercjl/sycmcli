import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, requireFlag, integerFlag, booleanFlag } from './args.mjs';
import { capabilities } from './capabilities.mjs';
import { browserIdentity, ensureBrowser, isCdpReady } from './cdp.mjs';
import { configRoot, currentStore, listStores, publicStore, readStore, resolveStore, setCurrentStore, updateStore, writeStore } from './config.mjs';
import { CliError, invariant } from './errors.mjs';
import { writeOutput } from './export.mjs';
import { installSkill, skillSource, skillStatus } from './skill-manager.mjs';
import { categorySearch, categoryTree, itemRank, keywordRank, mainCategory, priceSegments, wordCategory, wordOverview, wordRelated, wordTrend } from './sycm.mjs';

const HELP = `sycmcli — read-only Shengyicanmou market data CLI

Usage:
  sycmcli stores add <alias> [--mode managed|attached] [--cdp-url http://127.0.0.1:9223] [--port 9333]
  sycmcli stores list | use <alias> | show [alias]
  sycmcli auth login|status [--store <alias>]
  sycmcli category search --keyword <text> [--store <alias>]
  sycmcli category tree | main [--store <alias>]
  sycmcli item rank [--cate-id ID] [--rank-type gmv|growth|flow|add|newitm_ipv] [--top N]
  sycmcli price segments [--cate-id ID]
  sycmcli keyword rank [--cate-id ID] [--keyword text]
  sycmcli word overview|trend|related|category --keyword <text>
  sycmcli capabilities --json
  sycmcli doctor --json
  sycmcli skill source|status|install|update [--agent codex|sealseek|agents|openclaw]

Common data options:
  --store <alias> --date-type day|recent7|recent30 --date-range YYYY-MM-DD|YYYY-MM-DD
  --page N --page-size N --out <file> --format json|csv|xlsx --force
`;

function output(value, flags = {}) {
  process.stdout.write(`${JSON.stringify(value, null, flags.json ? 2 : 2)}\n`);
}

function nextManagedPort(stores) {
  const used = new Set(stores.map((store) => Number(store.port)).filter(Boolean));
  let port = 9333;
  while (used.has(port)) port += 1;
  return port;
}

function identitySummary(identity) {
  return { stableId: identity.stableId, displayName: identity.displayName, runAsShopId: identity.runAsShopId, runAsShopTitle: identity.runAsShopTitle, mainUserId: identity.mainUserId, mainUserName: identity.mainUserName };
}

function identityMatches(expected, actual) {
  return !expected?.stableId || String(expected.stableId) === String(actual.stableId);
}

async function authenticatedStore(flags, { bind = true } = {}) {
  const store = resolveStore(flags);
  const cdpUrl = await ensureBrowser(store);
  const identity = await browserIdentity(cdpUrl);
  if (store.identity && !identityMatches(store.identity, identity)) {
    throw new CliError('STORE_IDENTITY_MISMATCH', `Store alias "${store.alias}" is bound to a different Shengyicanmou identity.`, { details: { expected: store.identity, actual: identitySummary(identity) }, hint: 'Use the Chrome profile that belongs to this alias, or create a new alias.' });
  }
  if (bind && !store.identity && !flags['store-config']) updateStore(store.alias, { identity: identitySummary(identity), lastAuthenticatedAt: new Date().toISOString() });
  return { store: { ...store, identity: store.identity || identitySummary(identity) }, cdpUrl, identity };
}

function dataOptions(flags) {
  return {
    cateId: flags['cate-id'], cateFlag: flags['cate-flag'], dateType: flags['date-type'], dateRange: flags['date-range'],
    rankType: flags['rank-type'], priceSeg: flags['price-seg'], minPrice: flags['min-price'], maxPrice: flags['max-price'],
    sellerType: flags['seller-type'], keyword: flags.keyword, order: flags.order, orderBy: flags['order-by'],
    indexCode: flags['index-code'], kwType: flags['kw-type'], device: flags.device, cycleFlag: flags['cycle-flag'],
    page: integerFlag(flags, 'page', 1), pageSize: integerFlag(flags, 'page-size', 10, { min: 1, max: 1000 }),
    top: integerFlag(flags, 'top', 0, { min: 0, max: 10000 }), maxPages: integerFlag(flags, 'max-pages', undefined, { min: 1, max: 500 })
  };
}

async function finishData(result, flags, meta) {
  const envelope = { ok: true, store: meta.store.alias, identity: identitySummary(meta.identity), fetchedAt: new Date().toISOString(), data: result };
  if (flags.out) {
    const exported = await writeOutput(result, String(flags.out), { format: flags.format && String(flags.format), force: booleanFlag(flags, 'force') });
    output({ ok: true, store: meta.store.alias, export: exported });
  } else output(envelope, flags);
}

async function handleStores(action, rest, flags) {
  if (action === 'add') {
    const alias = rest[0];
    invariant(alias, 'MISSING_ARGUMENT', 'stores add requires an alias.', { exitCode: 2 });
    const mode = String(flags.mode || 'managed');
    invariant(['managed', 'attached'].includes(mode), 'INVALID_ARGUMENT', '--mode must be managed or attached.', { exitCode: 2 });
    const root = configRoot();
    const port = flags.port ? integerFlag(flags, 'port', undefined, { min: 1024, max: 65535 }) : (mode === 'managed' ? nextManagedPort(listStores(root)) : Number(new URL(String(flags['cdp-url'] || 'http://127.0.0.1:9223')).port || 80));
    const cdpUrl = String(flags['cdp-url'] || `http://127.0.0.1:${port}`);
    const value = { mode, cdpUrl, port, ...(mode === 'managed' ? { profileDir: path.join(root, 'stores', alias, 'chrome-profile') } : {}), identity: null, createdAt: new Date().toISOString() };
    const store = writeStore(alias, value, root);
    if (!currentStore(root)) setCurrentStore(alias, root);
    return output({ ok: true, store: publicStore(store, root), current: currentStore(root) === alias });
  }
  if (action === 'list') return output({ ok: true, current: currentStore(), stores: listStores().map((store) => publicStore(store)) });
  if (action === 'use') {
    const alias = rest[0];
    invariant(alias, 'MISSING_ARGUMENT', 'stores use requires an alias.', { exitCode: 2 });
    setCurrentStore(alias);
    return output({ ok: true, current: alias });
  }
  if (action === 'show') {
    const alias = rest[0] || flags.store || currentStore();
    invariant(alias, 'STORE_REQUIRED', 'No store selected.');
    return output({ ok: true, store: publicStore(readStore(String(alias))) });
  }
  throw new CliError('UNKNOWN_COMMAND', `Unknown stores command: ${action || ''}`, { exitCode: 2 });
}

async function handleAuth(action, flags) {
  const store = resolveStore(flags);
  if (action === 'login') {
    const cdpUrl = await ensureBrowser(store, { openLogin: true });
    return output({ ok: true, store: store.alias, cdpUrl, message: 'Chrome is open. Complete login or verification there, then run auth status.' });
  }
  if (action === 'status') {
    const meta = await authenticatedStore(flags);
    return output({ ok: true, store: meta.store.alias, cdpUrl: meta.cdpUrl, authenticated: true, identity: identitySummary(meta.identity), bound: true });
  }
  throw new CliError('UNKNOWN_COMMAND', `Unknown auth command: ${action || ''}`, { exitCode: 2 });
}

async function handleSkill(action, flags) {
  const agent = flags.agent && String(flags.agent);
  if (action === 'source') return output({ ok: true, source: skillSource() });
  if (action === 'status') return output({ ok: true, ...skillStatus(agent) });
  if (action === 'install' || action === 'update') {
    const selected = agent || 'codex';
    return output({ ok: true, skill: installSkill(selected, { update: action === 'update' }) });
  }
  throw new CliError('UNKNOWN_COMMAND', `Unknown skill command: ${action || ''}`, { exitCode: 2 });
}

async function doctor() {
  const stores = listStores();
  const checks = [
    { id: 'node', ok: Number(process.versions.node.split('.')[0]) >= 20, value: process.version },
    { id: 'config-root', ok: true, value: configRoot() },
    { id: 'skill-source', ok: fs.existsSync(path.join(skillSource(), 'SKILL.md')), value: skillSource() },
    { id: 'stores-configured', ok: stores.length > 0, value: stores.length }
  ];
  for (const store of stores) checks.push({ id: `browser:${store.alias}`, ok: await isCdpReady(store.cdpUrl), value: store.cdpUrl });
  return { ok: checks.every((check) => check.ok), platform: process.platform, arch: process.arch, hostname: os.hostname(), checks };
}

export async function main(argv) {
  const { positionals, flags } = parseArgs(argv);
  const [command, action, ...rest] = positionals;
  if (!command || command === 'help' || flags.help) { process.stdout.write(HELP); return; }
  if (command === 'version' || flags.version) { output({ name: '@petercjl/sycmcli', version: capabilities.version }); return; }
  if (command === 'capabilities') { output(capabilities, flags); return; }
  if (command === 'doctor') { const result = await doctor(); output(result, flags); if (!result.ok) process.exitCode = 1; return; }
  if (command === 'stores') return handleStores(action, rest, flags);
  if (command === 'auth') return handleAuth(action, flags);
  if (command === 'skill') return handleSkill(action, flags);

  const meta = await authenticatedStore(flags);
  const options = dataOptions(flags);
  let result;
  if (command === 'category' && action === 'search') result = await categorySearch(meta.cdpUrl, { keyword: requireFlag(flags, 'keyword'), exact: booleanFlag(flags, 'exact'), leafOnly: booleanFlag(flags, 'leaf-only', true), cateLevel1Id: flags['cate-level1-id'], limit: flags.limit ? integerFlag(flags, 'limit', undefined, { min: 1 }) : undefined });
  else if (command === 'category' && action === 'tree') result = await categoryTree(meta.cdpUrl);
  else if (command === 'category' && action === 'main') result = await mainCategory(meta.cdpUrl);
  else if (command === 'item' && action === 'rank') result = await itemRank(meta.cdpUrl, options);
  else if (command === 'price' && action === 'segments') result = await priceSegments(meta.cdpUrl, options);
  else if (command === 'keyword' && action === 'rank') result = await keywordRank(meta.cdpUrl, options);
  else if (command === 'word' && action === 'overview') result = await wordOverview(meta.cdpUrl, options);
  else if (command === 'word' && action === 'trend') result = await wordTrend(meta.cdpUrl, options);
  else if (command === 'word' && action === 'related') result = await wordRelated(meta.cdpUrl, options);
  else if (command === 'word' && action === 'category') result = await wordCategory(meta.cdpUrl, options);
  else throw new CliError('UNKNOWN_COMMAND', `Unknown command: ${[command, action].filter(Boolean).join(' ')}`, { exitCode: 2, hint: 'Run sycmcli help.' });
  await finishData(result, flags, meta);
}
