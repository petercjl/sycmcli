import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { configRoot } from './config.mjs';
import { CliError } from './errors.mjs';

const PACKAGE_NAME = '@petercjl/sycmcli';
const REGISTRY_ORIGIN = 'https://registry.npmjs.org';
const DEFAULT_INTERVAL_HOURS = 24;

function stateFile(root = configRoot()) {
  return path.join(root, 'update.json');
}

function defaultState() {
  return { schemaVersion: 1, autoUpdate: true, intervalHours: DEFAULT_INTERVAL_HOURS, lastCheckedAt: null, lastResult: null };
}

export function readUpdateState(root = configRoot()) {
  const file = stateFile(root);
  if (!fs.existsSync(file)) return defaultState();
  try { return { ...defaultState(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { return defaultState(); }
}

export function writeUpdateState(patch, root = configRoot()) {
  const next = { ...readUpdateState(root), ...patch, schemaVersion: 1 };
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const file = stateFile(root);
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
  return next;
}

function semverParts(version) {
  const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(left, right) {
  const a = semverParts(left);
  const b = semverParts(right);
  if (!a || !b) throw new CliError('INVALID_VERSION', `Cannot compare versions "${left}" and "${right}".`);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

async function registryJson(route) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`${REGISTRY_ORIGIN}${route}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new CliError('UPDATE_CHECK_FAILED', `npm registry returned HTTP ${response.status}.`);
    return await response.json();
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('UPDATE_CHECK_FAILED', 'Could not check npm for updates.', { details: error.message });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForUpdate(currentVersion, { force = false, root = configRoot() } = {}) {
  const state = readUpdateState(root);
  const intervalMs = Math.max(1, Number(state.intervalHours || DEFAULT_INTERVAL_HOURS)) * 3_600_000;
  if (!force && state.lastCheckedAt && Date.now() - Date.parse(state.lastCheckedAt) < intervalMs) {
    return { checked: false, reason: 'interval-not-elapsed', currentVersion, ...state.lastResult };
  }
  const tags = await registryJson('/-/package/%40petercjl%2Fsycmcli/dist-tags');
  const latestVersion = tags.latest;
  if (!latestVersion) throw new CliError('UPDATE_CHECK_FAILED', 'npm registry did not return a latest version.');
  const result = { checked: true, currentVersion, latestVersion, updateAvailable: compareVersions(latestVersion, currentVersion) > 0 };
  writeUpdateState({ lastCheckedAt: new Date().toISOString(), lastResult: result }, root);
  return result;
}

export async function installUpdate(currentVersion, { targetVersion, root = configRoot() } = {}) {
  const check = targetVersion
    ? { checked: true, currentVersion, latestVersion: targetVersion, updateAvailable: compareVersions(targetVersion, currentVersion) > 0 }
    : await checkForUpdate(currentVersion, { force: true, root });
  if (!check.updateAvailable) return { ...check, updated: false };
  const metadata = await registryJson(`/%40petercjl%2Fsycmcli/${encodeURIComponent(check.latestVersion)}`);
  const tarball = metadata?.dist?.tarball;
  if (metadata?.name !== PACKAGE_NAME || metadata?.version !== check.latestVersion || !tarball?.startsWith(`${REGISTRY_ORIGIN}/@petercjl/sycmcli/-/`)) {
    throw new CliError('UPDATE_METADATA_INVALID', 'npm returned unexpected package metadata; update was stopped.');
  }
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const run = childProcess.spawnSync(npmCommand, ['install', '--global', tarball], { encoding: 'utf8', timeout: 120_000, env: { ...process.env, SYCMCLI_DISABLE_AUTO_UPDATE: '1' } });
  if (run.error || run.status !== 0) {
    throw new CliError('UPDATE_INSTALL_FAILED', 'Automatic update failed.', { details: (run.stderr || run.error?.message || '').trim(), hint: `Run: npm install -g ${PACKAGE_NAME}@${check.latestVersion}` });
  }
  const result = { ...check, updated: true, installedVersion: check.latestVersion };
  writeUpdateState({ lastCheckedAt: new Date().toISOString(), lastResult: result, lastUpdatedAt: new Date().toISOString() }, root);
  return result;
}

export async function autoUpdateIfNeeded(currentVersion) {
  if (process.env.SYCMCLI_DISABLE_AUTO_UPDATE === '1') return { checked: false, reason: 'disabled-by-environment' };
  const state = readUpdateState();
  if (!state.autoUpdate) return { checked: false, reason: 'disabled-by-config' };
  try {
    const check = await checkForUpdate(currentVersion);
    return check.updateAvailable ? installUpdate(currentVersion, { targetVersion: check.latestVersion }) : check;
  } catch (error) {
    writeUpdateState({ lastCheckedAt: new Date().toISOString(), lastResult: { checked: true, currentVersion, error: error.message } });
    throw error;
  }
}
