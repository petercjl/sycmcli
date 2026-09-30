import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { configRoot } from './config.mjs';
import { findBusinessCapability } from './business-capabilities.mjs';
import { CliError, invariant } from './errors.mjs';

const PLAN_TTL_MS = 15 * 60 * 1000;

function plansRoot(root = configRoot()) { return path.join(root, 'plans'); }
function auditRoot(root = configRoot()) { return path.join(root, 'audit'); }
function ensurePrivateDir(dir) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); try { fs.chmodSync(dir, 0o700); } catch {} }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value) { return crypto.createHash('sha256').update(stable(value)).digest('hex'); }
function planFile(planId, root) {
  invariant(/^[0-9a-f-]{36}$/.test(planId || ''), 'INVALID_PLAN_ID', 'Invalid mutation plan ID.', { exitCode: 2 });
  return path.join(plansRoot(root), `${planId}.json`);
}
function writeExclusive(file, value) {
  ensurePrivateDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  try { fs.chmodSync(file, 0o600); } catch {}
}
function appendAudit(event, root) {
  const dir = auditRoot(root); ensurePrivateDir(dir);
  const file = path.join(dir, 'mutations.jsonl');
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch {}
}

export function createMutationPlan({ capabilityId, store, payload, now = new Date(), root = configRoot() }) {
  const capability = findBusinessCapability(capabilityId);
  invariant(capability?.sideEffect === 'write', 'UNKNOWN_MUTATION', `Unknown mutation capability: ${capabilityId}`, { exitCode: 2 });
  invariant(store?.alias, 'STORE_REQUIRED', 'A store is required for a mutation plan.');
  invariant(store?.identity?.stableId, 'AUTH_REQUIRED', 'Bind the store identity with a successful authenticated read before creating a mutation plan.');
  invariant(payload && typeof payload === 'object' && !Array.isArray(payload), 'INVALID_ARGUMENT', 'Mutation payload must be a JSON object.', { exitCode: 2 });
  const missing = (capability.requiredFields || []).filter((key) => payload[key] === undefined || payload[key] === null);
  invariant(missing.length === 0, 'MISSING_ARGUMENT', `Mutation payload is missing: ${missing.join(', ')}.`, { exitCode: 2 });
  const planId = crypto.randomUUID();
  const confirmationCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  const createdAt = now.toISOString();
  const plan = {
    schemaVersion: 1, planId, status: 'planned', capabilityId, storeAlias: store.alias,
    identity: { stableId: String(store.identity.stableId), displayName: store.identity.displayName || null },
    payload, payloadDigest: digest(payload), confirmationDigest: digest({ planId, confirmationCode }),
    idempotencyKey: crypto.randomUUID(), createdAt, expiresAt: new Date(now.getTime() + PLAN_TTL_MS).toISOString()
  };
  writeExclusive(planFile(planId, root), plan);
  appendAudit({ at: createdAt, event: 'plan.created', planId, capabilityId, storeAlias: store.alias, identityStableId: String(store.identity.stableId), payloadDigest: plan.payloadDigest }, root);
  return { planId, capabilityId, store: store.alias, identity: plan.identity, payloadDigest: plan.payloadDigest, idempotencyKey: plan.idempotencyKey, createdAt, expiresAt: plan.expiresAt, confirmationCode, preview: { summary: capability.summary, fields: Object.keys(payload).sort() } };
}

export function readMutationPlan(planId, root = configRoot()) {
  const file = planFile(planId, root);
  if (!fs.existsSync(file)) throw new CliError('PLAN_NOT_FOUND', `Mutation plan not found: ${planId}`);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { throw new CliError('PLAN_INVALID', 'Mutation plan cannot be read.', { details: error.message }); }
}

export function authorizeMutationPlan({ planId, confirmationCode, store, now = new Date(), root = configRoot() }) {
  const plan = readMutationPlan(planId, root);
  invariant(plan.status === 'planned', 'PLAN_ALREADY_USED', 'Mutation plan has already been applied or invalidated.');
  invariant(Date.parse(plan.expiresAt) > now.getTime(), 'PLAN_EXPIRED', 'Mutation plan has expired. Create a new plan.');
  invariant(digest(plan.payload) === plan.payloadDigest, 'PLAN_TAMPERED', 'Mutation plan payload integrity check failed.');
  invariant(digest({ planId, confirmationCode: String(confirmationCode || '').toUpperCase() }) === plan.confirmationDigest, 'CONFIRMATION_FAILED', 'Mutation confirmation code is incorrect.');
  invariant(store?.alias === plan.storeAlias, 'STORE_IDENTITY_MISMATCH', 'Mutation plan belongs to a different store alias.');
  invariant(String(store?.identity?.stableId || '') === String(plan.identity?.stableId || ''), 'STORE_IDENTITY_MISMATCH', 'Current store identity does not match the mutation plan.');
  const capability = findBusinessCapability(plan.capabilityId);
  const authorizedAt = now.toISOString();
  const updated = { ...plan, status: 'authorized', authorizedAt };
  const file = planFile(planId, root);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
  appendAudit({ at: authorizedAt, event: 'plan.authorized', planId, capabilityId: plan.capabilityId, storeAlias: plan.storeAlias, identityStableId: plan.identity.stableId, payloadDigest: plan.payloadDigest, idempotencyKey: plan.idempotencyKey }, root);
  return {
    planId, capabilityId: plan.capabilityId, store: plan.storeAlias, identity: plan.identity,
    idempotencyKey: plan.idempotencyKey, payloadDigest: plan.payloadDigest,
    action: 'agent.mutation.execute',
    instruction: `Execute the registered ${plan.capabilityId} workflow using the authenticated browser for store ${plan.storeAlias}. Stop before any action outside the workflow or if the preview differs from this payload. After execution, perform the required readback.`,
    workflow: capability ? { entryUrl: capability.entryUrl, steps: capability.steps, verification: capability.verification, excludedActions: capability.excludedActions } : null,
    payload: plan.payload,
    verification: { required: true, expectedIdentityStableId: plan.identity.stableId },
    summary: capability?.summary || plan.capabilityId
  };
}
