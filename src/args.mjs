import { CliError } from './errors.mjs';

export function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const equal = token.indexOf('=');
    if (equal !== -1) {
      flags[token.slice(2, equal)] = token.slice(equal + 1);
      continue;
    }
    const key = token.slice(2);
    if (key.startsWith('no-')) {
      flags[key.slice(3)] = false;
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { positionals, flags };
}

export function requireFlag(flags, name) {
  const value = flags[name];
  if (value === undefined || value === true || value === '') {
    throw new CliError('MISSING_ARGUMENT', `Missing required option --${name}.`, { exitCode: 2 });
  }
  return String(value);
}

export function integerFlag(flags, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (flags[name] === undefined) return fallback;
  const value = Number.parseInt(String(flags[name]), 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CliError('INVALID_ARGUMENT', `--${name} must be an integer from ${min} to ${max}.`, { exitCode: 2 });
  }
  return value;
}

export function booleanFlag(flags, name, fallback = false) {
  if (flags[name] === undefined) return fallback;
  if (typeof flags[name] === 'boolean') return flags[name];
  const normalized = String(flags[name]).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new CliError('INVALID_ARGUMENT', `--${name} must be true or false.`, { exitCode: 2 });
}
