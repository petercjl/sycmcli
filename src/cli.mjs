import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, requireFlag, integerFlag, booleanFlag } from './args.mjs';
import { capabilities } from './capabilities.mjs';
import { runAnalysis } from './analysis-runner.mjs';
import { businessCapabilities, findBusinessCapability, mutationCapabilities } from './business-capabilities.mjs';
import { browserDetails, browserIdentity, browserStatus, closeBrowser, ensureBrowser, focusBrowser, isCdpReady, labelStorePage } from './cdp.mjs';
import { configRoot, currentStore, listStores, managedProfileDir, publicStore, readStore, resolveStore, setCurrentStore, updateStore, writeStore } from './config.mjs';
import { CliError, invariant } from './errors.mjs';
import { writeOutput } from './export.mjs';
import { buildRegisteredHostScript, readJsonObject, runRegisteredOperation } from './data-runner.mjs';
import { buildHostBrowserScript, completeHostResult, readHostPayload } from './host-browser.mjs';
import { createMutationPlan, authorizeMutationPlan, readMutationPlan } from './mutation-plans.mjs';
import { getOperation, getService, listOperations } from './operation-registry.mjs';
import { installSkill, skillSource, skillStatus } from './skill-manager.mjs';
import { categorySearch, categoryTree, itemRank, keywordRank, mainCategory, priceSegments, wordCategory, wordOverview, wordRelated, wordTrend } from './sycm.mjs';
import { autoUpdateIfNeeded, checkForUpdate, currentInstallPrefix, installUpdate, readUpdateState, writeUpdateState } from './update-manager.mjs';

const HELP = `sycmcli — Taobao/Tmall business data and guarded operations CLI

Usage:
  sycmcli stores add <alias> [--display-name <name>] [--mode managed|attached|host]
  sycmcli stores migrate <alias> --mode managed
  sycmcli stores list | use <alias> | show [alias]
  sycmcli stores label <alias> --display-name <name>
  sycmcli browser list
  sycmcli browser open|status|focus|stop [--store <alias>]
  sycmcli auth login|status|bind [--store <alias>]
  sycmcli category search --keyword <text> [--store <alias>]
  sycmcli category tree | main [--store <alias>]
  sycmcli item rank [--cate-id ID] [--rank-type gmv|growth|flow|add|newitm_ipv] [--top N]
  sycmcli price segments [--cate-id ID]
  sycmcli keyword rank [--cate-id ID] [--keyword text]
  sycmcli word overview|trend|related|category --keyword <text>
  sycmcli data operations
  sycmcli data run <operation-id> --params-json <json-or-file> [--store <alias>]
  sycmcli business list | show <capability-id>
  sycmcli analyze run <capability-id> --input-json <json-or-file> [--out <file>]
  sycmcli mutation plan <capability-id> --params-json <json-or-file> [--store <alias>]
  sycmcli mutation show <plan-id>
  sycmcli mutation apply <plan-id> --confirm <code> [--store <alias>]
  sycmcli capabilities --json
  sycmcli doctor --json
  sycmcli skill source|status|install|update [--agent codex|sealseek|agents|openclaw]
  sycmcli update status|check|install|config [--auto-update true|false] [--interval-hours N]
  sycmcli host complete --store <alias> < evaluate-result.json

Common data options:
  --store <alias> --date-type day|recent7|recent30 --date-range YYYY-MM-DD|YYYY-MM-DD
  --page N --page-size N --out <file> --format json|csv|xlsx --force
`;

function output(value, flags = {}) {
  process.stdout.write(`${JSON.stringify(value, null, flags.json ? 2 : 2)}\n`);
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
    invariant(['managed', 'attached', 'host'].includes(mode), 'INVALID_ARGUMENT', '--mode must be managed, attached, or host.', { exitCode: 2 });
    const root = configRoot();
    let value;
    if (mode === 'host') {
      const platform = String(flags.platform || 'sealseek');
      invariant(platform === 'sealseek', 'INVALID_ARGUMENT', 'Host browser mode currently supports --platform sealseek.', { exitCode: 2 });
      value = { mode, platform, browserProfile: String(flags['browser-profile'] || alias), displayName: flags['display-name'] ? String(flags['display-name']) : alias, identity: null, createdAt: new Date().toISOString() };
    } else {
      const attachedUrl = String(flags['cdp-url'] || 'http://127.0.0.1:9223');
      value = mode === 'managed'
        ? { mode, profileDir: managedProfileDir(alias, root), displayName: flags['display-name'] ? String(flags['display-name']) : alias, identity: null, createdAt: new Date().toISOString() }
        : { mode, cdpUrl: attachedUrl, port: Number(new URL(attachedUrl).port || 80), displayName: flags['display-name'] ? String(flags['display-name']) : alias, identity: null, createdAt: new Date().toISOString() };
    }
    const store = writeStore(alias, value, root);
    if (!currentStore(root)) setCurrentStore(alias, root);
    return output({ ok: true, store: publicStore(store, root), current: currentStore(root) === alias });
  }
  if (action === 'list') return output({ ok: true, current: currentStore(), stores: listStores().map((store) => publicStore(store)) });
  if (action === 'migrate') {
    const alias = rest[0];
    invariant(alias, 'MISSING_ARGUMENT', 'stores migrate requires an alias.', { exitCode: 2 });
    invariant(String(flags.mode || '') === 'managed', 'INVALID_ARGUMENT', 'stores migrate currently requires --mode managed.', { exitCode: 2 });
    const existing = readStore(alias, configRoot());
    const migrated = updateStore(alias, {
      mode: 'managed', platform: undefined, browserProfile: undefined, cdpUrl: undefined, port: undefined,
      profileDir: existing.profileDir || managedProfileDir(alias), migratedAt: new Date().toISOString()
    });
    return output({ ok: true, store: publicStore(migrated), loginRequired: true, message: 'The store now uses its own managed Chrome profile. Run auth login and complete first-party login once.' });
  }
  if (action === 'use') {
    const alias = rest[0];
    invariant(alias, 'MISSING_ARGUMENT', 'stores use requires an alias.', { exitCode: 2 });
    setCurrentStore(alias);
    return output({ ok: true, current: alias });
  }
  if (action === 'label') {
    const alias = rest[0];
    invariant(alias, 'MISSING_ARGUMENT', 'stores label requires an alias.', { exitCode: 2 });
    const displayName = String(requireFlag(flags, 'display-name')).trim();
    invariant(displayName, 'INVALID_ARGUMENT', '--display-name cannot be empty.', { exitCode: 2 });
    const store = updateStore(alias, { displayName });
    let liveTitle = null;
    if (store.mode !== 'host') {
      const status = await browserStatus(store);
      if (status.state === 'running') liveTitle = await labelStorePage(status.cdpUrl, store);
    }
    return output({ ok: true, store: publicStore(store), liveTitle, profileNameAppliesOnNextLaunch: store.mode === 'managed' });
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
  if (store.mode === 'host') {
    if (action === 'login') return output({ ok: true, actionRequired: 'browser.login', store: store.alias, platform: store.platform, browserProfile: store.browserProfile, url: 'https://sycm.taobao.com/', message: 'Open this URL in the named SealSeek browser profile and complete login.' });
    if (action === 'status') return output({ ok: true, store: store.alias, authenticated: Boolean(store.identity), identity: store.identity || null, verification: store.identity ? 'bound-by-last-successful-fetch' : 'run-one-data-command-to-verify' });
  }
  if (action === 'login') {
    await ensureBrowser(store, { openLogin: true });
    return output({ ok: true, store: store.alias, browser: { ...(await browserDetails(store)), profileDir: publicStore(store).profileDir || null }, message: 'The full interactive store browser is open. Complete login, slider, or verification there, then run auth bind.' });
  }
  if (action === 'status' || action === 'bind') {
    const meta = await authenticatedStore(flags);
    return output({ ok: true, store: meta.store.alias, authenticated: true, identity: identitySummary(meta.identity), bound: true });
  }
  throw new CliError('UNKNOWN_COMMAND', `Unknown auth command: ${action || ''}`, { exitCode: 2 });
}

async function handleBrowser(action, flags) {
  if (action === 'list') {
    const stores = listStores().filter((store) => !store.invalid);
    const browsers = await Promise.all(stores.map(async (store) => {
      const details = await browserDetails(store);
      return { ...details, profileDir: publicStore(store).profileDir || null };
    }));
    return output({ ok: true, current: currentStore(), browsers });
  }
  const store = resolveStore(flags);
  invariant(store.mode === 'managed', 'INVALID_STORE_MODE', 'Browser lifecycle commands require a managed store.');
  if (action === 'status') return output({ ok: true, store: publicStore(store), browser: { ...(await browserDetails(store)), profileDir: publicStore(store).profileDir || null } });
  if (action === 'open') {
    await ensureBrowser(store, { openLogin: true });
    return output({ ok: true, store: publicStore(store), browser: { ...(await browserDetails(store)), profileDir: publicStore(store).profileDir || null }, message: 'The store browser is open in full interactive Chrome. Complete login or slider verification if prompted.' });
  }
  if (action === 'focus') return output({ ok: true, store: publicStore(store), browser: { ...(await focusBrowser(store)), profileDir: publicStore(store).profileDir || null } });
  if (action === 'stop') return output({ ok: true, store: publicStore(store), browser: await closeBrowser(store) });
  throw new CliError('UNKNOWN_COMMAND', `Unknown browser command: ${action || ''}`, { exitCode: 2 });
}

async function handleUpdate(action, flags) {
  if (action === 'status') return output({ ok: true, currentVersion: capabilities.version, installPrefix: currentInstallPrefix(), ...readUpdateState() });
  if (action === 'check') return output({ ok: true, ...(await checkForUpdate(capabilities.version, { force: true })) });
  if (action === 'install') return output({ ok: true, ...(await installUpdate(capabilities.version)) });
  if (action === 'config') {
    const patch = {};
    if (flags['auto-update'] !== undefined) patch.autoUpdate = booleanFlag(flags, 'auto-update');
    if (flags['interval-hours'] !== undefined) patch.intervalHours = integerFlag(flags, 'interval-hours', 24, { min: 1, max: 720 });
    invariant(Object.keys(patch).length > 0, 'MISSING_ARGUMENT', 'Pass --auto-update true|false or --interval-hours N.', { exitCode: 2 });
    return output({ ok: true, ...writeUpdateState(patch) });
  }
  throw new CliError('UNKNOWN_COMMAND', `Unknown update command: ${action || ''}`, { exitCode: 2 });
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
  for (const store of stores) {
    if (store.mode === 'host') checks.push({ id: `browser:${store.alias}`, ok: true, value: `${store.platform}:${store.browserProfile}`, verification: 'agent-runtime-required' });
    else if (store.mode === 'managed') {
      const status = await browserStatus(store);
      checks.push({
        id: `browser:${store.alias}`,
        ok: Boolean(store.profileDir) && status.headless !== true,
        value: status.state,
        profile: publicStore(store).profileDir,
        browser: status.browser,
        headless: status.headless,
        interactive: status.interactive,
        verification: status.state === 'running' ? 'full-browser-runtime-checked' : 'starts-on-demand'
      });
    } else checks.push({ id: `browser:${store.alias}`, ok: await isCdpReady(store.cdpUrl), value: store.cdpUrl });
  }
  return { ok: checks.every((check) => check.ok), platform: process.platform, arch: process.arch, hostname: os.hostname(), checks };
}

function operationFor(command, action) {
  const key = `${command || ''} ${action || ''}`.trim();
  return ({
    'category search': 'category-search', 'category tree': 'category-tree', 'category main': 'category-main',
    'item rank': 'item-rank', 'price segments': 'price-segments', 'keyword rank': 'keyword-rank',
    'word overview': 'word-overview', 'word trend': 'word-trend', 'word related': 'word-related', 'word category': 'word-category'
  })[key] || null;
}

async function handleData(action, rest, flags) {
  if (action === 'operations') return output({ ok: true, operations: listOperations() });
  invariant(action === 'run', 'UNKNOWN_COMMAND', `Unknown data command: ${action || ''}`, { exitCode: 2 });
  const operationId = rest[0];
  invariant(operationId, 'MISSING_ARGUMENT', 'data run requires an operation ID.', { exitCode: 2 });
  const operation = getOperation(operationId);
  const service = getService(operation.service);
  const params = readJsonObject(flags['params-json']);
  const selectedStore = resolveStore(flags);
  if (selectedStore.mode === 'host' || flags.transport === 'host') {
    return output({
      ok: true, action: 'browser.evaluate', store: publicStore(selectedStore),
      platform: String(flags.platform || selectedStore.platform || 'sealseek'),
      browserProfile: String(flags['browser-profile'] || selectedStore.browserProfile || selectedStore.alias),
      url: service.entryUrl, script: buildRegisteredHostScript(operationId, params, selectedStore.identity),
      completion: { command: `sycmcli host complete --store ${selectedStore.alias} --transport host` }
    });
  }
  const meta = await authenticatedStore(flags);
  const result = await runRegisteredOperation(meta.cdpUrl, operationId, params);
  await finishData(result, flags, meta);
}

function handleBusiness(action, rest) {
  if (action === 'list') return output({ ok: true, count: businessCapabilities.length, capabilities: businessCapabilities, mutations: mutationCapabilities });
  if (action === 'show') {
    const id = rest[0];
    invariant(id, 'MISSING_ARGUMENT', 'business show requires a capability ID.', { exitCode: 2 });
    const capability = findBusinessCapability(id);
    invariant(capability, 'CAPABILITY_NOT_FOUND', `Unknown business capability: ${id}`, { exitCode: 2 });
    return output({ ok: true, capability });
  }
  throw new CliError('UNKNOWN_COMMAND', `Unknown business command: ${action || ''}`, { exitCode: 2 });
}

async function handleAnalyze(action, rest, flags) {
  invariant(action === 'run', 'UNKNOWN_COMMAND', `Unknown analyze command: ${action || ''}`, { exitCode: 2 });
  const capabilityId = rest[0];
  invariant(capabilityId, 'MISSING_ARGUMENT', 'analyze run requires a capability ID.', { exitCode: 2 });
  const result = runAnalysis(capabilityId, readJsonObject(flags['input-json']));
  if (flags.out) {
    const exported = await writeOutput(result, String(flags.out), { format: flags.format && String(flags.format), force: booleanFlag(flags, 'force') });
    return output({ ok: true, capabilityId, export: exported });
  }
  return output({ ok: true, capabilityId, data: result });
}

async function handleMutation(action, rest, flags) {
  if (action === 'show') {
    const planId = rest[0];
    invariant(planId, 'MISSING_ARGUMENT', 'mutation show requires a plan ID.', { exitCode: 2 });
    const plan = readMutationPlan(planId);
    return output({ ok: true, plan: { ...plan, payload: undefined, confirmationDigest: undefined, payloadFields: Object.keys(plan.payload || {}).sort() } });
  }
  const planIdOrCapability = rest[0];
  invariant(planIdOrCapability, 'MISSING_ARGUMENT', `mutation ${action || ''} requires an identifier.`, { exitCode: 2 });
  let store = resolveStore(flags);
  if (!store.identity && store.mode !== 'host') store = (await authenticatedStore(flags)).store;
  if (action === 'plan') {
    const payload = readJsonObject(flags['params-json']);
    return output({ ok: true, plan: createMutationPlan({ capabilityId: planIdOrCapability, store, payload }) });
  }
  if (action === 'apply') {
    const confirmationCode = requireFlag(flags, 'confirm');
    return output({ ok: true, authorized: authorizeMutationPlan({ planId: planIdOrCapability, confirmationCode, store }) });
  }
  throw new CliError('UNKNOWN_COMMAND', `Unknown mutation command: ${action || ''}`, { exitCode: 2 });
}

async function prepareHostTask(store, operation, flags) {
  const options = dataOptions(flags);
  if (operation === 'category-search') {
    options.keyword = requireFlag(flags, 'keyword');
    options.exact = booleanFlag(flags, 'exact');
    options.leafOnly = booleanFlag(flags, 'leaf-only', true);
    options.cateLevel1Id = flags['cate-level1-id'];
    options.limit = flags.limit ? integerFlag(flags, 'limit', undefined, { min: 1 }) : undefined;
  }
  output({
    ok: true,
    action: 'browser.evaluate',
    store: publicStore(store),
    platform: String(flags.platform || store.platform || 'sealseek'),
    browserProfile: String(flags['browser-profile'] || store.browserProfile || store.alias),
    url: 'https://sycm.taobao.com/',
    script: buildHostBrowserScript(operation, options),
    completion: { command: `sycmcli host complete --store ${store.alias} --transport host` }
  });
}

export async function main(argv) {
  const { positionals, flags } = parseArgs(argv);
  const [command, action, ...rest] = positionals;
  if (!command || command === 'help' || flags.help) { process.stdout.write(HELP); return; }
  if (command === 'version' || flags.version) { output({ name: '@petercjl/sycmcli', version: capabilities.version }); return; }
  if (command !== 'update') {
    try {
      const update = await autoUpdateIfNeeded(capabilities.version);
      if (update.updated) process.stderr.write(`${JSON.stringify({ ok: true, notice: 'SYCMCLI_UPDATED', installedVersion: update.installedVersion, message: 'The update is installed and will be used by the next command.' })}\n`);
    } catch (error) {
      process.stderr.write(`${JSON.stringify({ ok: false, warning: 'AUTO_UPDATE_FAILED', message: error.message })}\n`);
    }
  }
  if (command === 'capabilities') { output(capabilities, flags); return; }
  if (command === 'business') return handleBusiness(action, rest);
  if (command === 'analyze') return handleAnalyze(action, rest, flags);
  if (command === 'doctor') { const result = await doctor(); output(result, flags); if (!result.ok) process.exitCode = 1; return; }
  if (command === 'stores') return handleStores(action, rest, flags);
  if (command === 'browser') return handleBrowser(action, flags);
  if (command === 'auth') return handleAuth(action, flags);
  if (command === 'skill') return handleSkill(action, flags);
  if (command === 'update') return handleUpdate(action, flags);
  if (command === 'data') return handleData(action, rest, flags);
  if (command === 'mutation') return handleMutation(action, rest, flags);
  if (command === 'host' && action === 'complete') {
    const store = resolveStore(flags);
    invariant(store.mode === 'host' || flags.transport === 'host', 'INVALID_STORE_MODE', 'host complete requires a host-mode store or --transport host.');
    const payload = await readHostPayload();
    return output(await completeHostResult(store, payload, { out: flags.out && String(flags.out), format: flags.format && String(flags.format), force: booleanFlag(flags, 'force') }));
  }

  const operation = operationFor(command, action);
  if (!operation) throw new CliError('UNKNOWN_COMMAND', `Unknown command: ${[command, action].filter(Boolean).join(' ')}`, { exitCode: 2, hint: 'Run sycmcli help.' });
  const selectedStore = resolveStore(flags);
  if (selectedStore.mode === 'host' || flags.transport === 'host') return prepareHostTask(selectedStore, operation, flags);

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
