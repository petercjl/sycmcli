import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CliError, invariant } from './errors.mjs';

const ALIAS_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
export const MANAGED_PORT_MIN = 19000;
export const MANAGED_PORT_MAX = 19999;

export function configRoot(env = process.env, platform = process.platform) {
  if (env.SYCMCLI_HOME) return path.resolve(env.SYCMCLI_HOME);
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'sycmcli');
  if (platform === 'win32') return path.join(env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'sycmcli');
  return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'sycmcli');
}

export function storesRoot(root = configRoot()) {
  return path.join(root, 'stores');
}

export function managedProfileDir(alias, root = configRoot(), env = process.env, platform = process.platform) {
  validateAlias(alias);
  if (platform === 'win32') {
    const localRoot = env.LOCALAPPDATA || env.APPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localRoot, 'sycmcli', 'stores', alias, 'chrome-profile');
  }
  return path.join(storesRoot(root), alias, 'chrome-profile');
}

function aliasHash(alias) {
  let hash = 2166136261;
  for (const character of alias) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function allocateManagedPort(alias, root = configRoot()) {
  validateAlias(alias);
  const used = new Set(listStores(root)
    .filter((store) => !store.invalid && store.alias !== alias && store.mode === 'managed')
    .map((store) => Number(store.port))
    .filter((port) => Number.isInteger(port) && port >= MANAGED_PORT_MIN && port <= MANAGED_PORT_MAX));
  const capacity = MANAGED_PORT_MAX - MANAGED_PORT_MIN + 1;
  const start = aliasHash(alias) % capacity;
  for (let offset = 0; offset < capacity; offset += 1) {
    const port = MANAGED_PORT_MIN + ((start + offset) % capacity);
    if (!used.has(port)) return port;
  }
  throw new CliError('MANAGED_PORTS_EXHAUSTED', `No managed browser port is available in ${MANAGED_PORT_MIN}-${MANAGED_PORT_MAX}.`);
}

export function ensureManagedPort(store, root = configRoot()) {
  if (store?.mode !== 'managed') return store;
  const current = Number(store.port);
  if (Number.isInteger(current) && current >= MANAGED_PORT_MIN && current <= MANAGED_PORT_MAX) return store;
  const port = allocateManagedPort(store.alias, root);
  if (store.custom) return { ...store, port };
  return updateStore(store.alias, { port }, root);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch {}
}

function atomicJson(file, value) {
  ensureDir(path.dirname(file));
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
}

export function validateAlias(alias) {
  invariant(ALIAS_PATTERN.test(alias || ''), 'INVALID_STORE_ALIAS', 'Store alias must be 1-64 letters, numbers, dots, underscores, or hyphens.', { exitCode: 2 });
}

export function storeDir(alias, root = configRoot()) {
  validateAlias(alias);
  return path.join(storesRoot(root), alias);
}

export function storeFile(alias, root = configRoot()) {
  return path.join(storeDir(alias, root), 'store.json');
}

export function readStore(alias, root = configRoot()) {
  const file = storeFile(alias, root);
  if (!fs.existsSync(file)) {
    throw new CliError('STORE_NOT_FOUND', `Store alias "${alias}" does not exist.`, { hint: `Run: sycmcli stores add ${alias}` });
  }
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    throw new CliError('STORE_CONFIG_INVALID', `Cannot read store configuration for "${alias}".`, { details: error.message });
  }
  return { ...value, alias, file };
}

export function writeStore(alias, value, root = configRoot(), { replace = false } = {}) {
  const file = storeFile(alias, root);
  if (fs.existsSync(file) && !replace) {
    throw new CliError('STORE_EXISTS', `Store alias "${alias}" already exists.`, { hint: 'Choose another alias or update the existing store explicitly.' });
  }
  atomicJson(file, { ...value, alias, schemaVersion: 2, updatedAt: new Date().toISOString() });
  return readStore(alias, root);
}

export function updateStore(alias, patch, root = configRoot()) {
  const current = readStore(alias, root);
  const { file: _file, ...persisted } = current;
  atomicJson(storeFile(alias, root), { ...persisted, ...patch, alias, schemaVersion: 2, updatedAt: new Date().toISOString() });
  return readStore(alias, root);
}

export function listStores(root = configRoot()) {
  const dir = storesRoot(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && ALIAS_PATTERN.test(entry.name) && fs.existsSync(storeFile(entry.name, root)))
    .map((entry) => {
      try { return readStore(entry.name, root); } catch { return { alias: entry.name, invalid: true }; }
    })
    .sort((a, b) => a.alias.localeCompare(b.alias));
}

export function currentStore(root = configRoot()) {
  const file = path.join(root, 'current-store');
  if (!fs.existsSync(file)) return null;
  const alias = fs.readFileSync(file, 'utf8').trim();
  return alias || null;
}

export function setCurrentStore(alias, root = configRoot()) {
  readStore(alias, root);
  ensureDir(root);
  const file = path.join(root, 'current-store');
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${alias}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
  return alias;
}

export function resolveStore(flags, root = configRoot()) {
  if (flags['store-config']) {
    const file = path.resolve(String(flags['store-config']));
    let value;
    try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
      throw new CliError('STORE_CONFIG_INVALID', `Cannot read --store-config ${file}.`, { details: error.message });
    }
    invariant(value.alias, 'STORE_CONFIG_INVALID', 'The custom store config needs an alias.');
    return { ...value, file, custom: true };
  }
  const alias = flags.store ? String(flags.store) : currentStore(root);
  if (!alias) throw new CliError('STORE_REQUIRED', 'No store selected.', { hint: 'Pass --store <alias> or run sycmcli stores use <alias>.' });
  return readStore(alias, root);
}

export function publicStore(store, root = configRoot()) {
  return {
    alias: store.alias,
    displayName: store.displayName,
    mode: store.mode,
    platform: store.platform,
    browserProfile: store.browserProfile,
    cdpUrl: store.cdpUrl,
    port: store.port,
    profileDir: store.profileDir ? path.relative(root, store.profileDir) || '.' : undefined,
    identity: store.identity || null,
    createdAt: store.createdAt,
    updatedAt: store.updatedAt
  };
}
