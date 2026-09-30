import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(packageRoot, 'skill', 'sycmcli');
const manifestName = '.sycmcli-managed.json';

export function skillSource() {
  return source;
}

export function agentRoots(env = process.env) {
  return {
    codex: path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills'),
    agents: path.join(os.homedir(), '.agents', 'skills'),
    openclaw: path.join(os.homedir(), '.openclaw', 'skills'),
    sealseek: path.join(os.homedir(), '.sealseek', 'skill_pool')
  };
}

function hashTree(root) {
  const hash = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === manifestName) continue;
      const file = path.join(dir, entry.name);
      const relative = path.relative(root, file);
      hash.update(relative);
      if (entry.isDirectory()) walk(file);
      else hash.update(fs.readFileSync(file));
    }
  };
  walk(root);
  return hash.digest('hex');
}

function targetInfo(agent, roots = agentRoots()) {
  if (!roots[agent]) throw new CliError('INVALID_AGENT', `Unknown agent "${agent}".`, { hint: `Use one of: ${Object.keys(roots).join(', ')}` });
  const target = path.join(roots[agent], 'sycmcli');
  return { agent, target, manifest: path.join(target, manifestName) };
}

function inspect(agent, roots = agentRoots()) {
  const info = targetInfo(agent, roots);
  if (!fs.existsSync(info.target)) return { ...info, installed: false, managed: false, current: false };
  let managed = false;
  let manifest = null;
  if (fs.lstatSync(info.target).isSymbolicLink()) {
    const linked = path.resolve(path.dirname(info.target), fs.readlinkSync(info.target));
    managed = linked === source;
    return { ...info, installed: true, managed, mode: 'symlink', linkedSource: linked, current: managed && hashTree(source) === hashTree(linked) };
  }
  if (fs.existsSync(info.manifest)) {
    try { manifest = JSON.parse(fs.readFileSync(info.manifest, 'utf8')); managed = manifest.manager === '@petercjl/sycmcli'; } catch {}
  }
  return { ...info, installed: true, managed, mode: 'copy', current: managed && manifest?.digest === hashTree(source), manifest };
}

export function skillStatus(agent) {
  const agents = agent ? [agent] : Object.keys(agentRoots());
  return { source, digest: hashTree(source), agents: agents.map((name) => inspect(name)) };
}

function copyRecursive(from, to) {
  fs.cpSync(from, to, { recursive: true, preserveTimestamps: true });
  fs.writeFileSync(path.join(to, manifestName), `${JSON.stringify({ manager: '@petercjl/sycmcli', source, digest: hashTree(source), installedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
}

export function installSkill(agent, { update = false } = {}) {
  const info = inspect(agent);
  if (info.installed && !info.managed) throw new CliError('UNMANAGED_SKILL_EXISTS', `Refusing to replace unmanaged skill at ${info.target}.`);
  if (info.installed && !update) return info;
  fs.mkdirSync(path.dirname(info.target), { recursive: true });
  if (info.installed) {
    const backup = `${info.target}.backup-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`;
    if (fs.lstatSync(info.target).isSymbolicLink()) fs.unlinkSync(info.target);
    else fs.renameSync(info.target, backup);
  }
  if (process.platform !== 'win32') fs.symlinkSync(source, info.target, 'dir');
  else copyRecursive(source, info.target);
  return inspect(agent);
}
