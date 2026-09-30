import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { authorizeMutationPlan, createMutationPlan, readMutationPlan } from '../src/mutation-plans.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sycmcli-plan-'));
  const store = { alias: 'shop-a', identity: { stableId: '1001', displayName: 'Shop A' } };
  const now = new Date('2026-09-30T08:00:00.000Z');
  return { root, store, now };
}

test('mutation plan binds payload, identity, confirmation and idempotency', () => {
  const { root, store, now } = fixture();
  const created = createMutationPlan({ capabilityId: 'search-recommend-publish', store, payload: { content: { title: '测试' }, target: { itemId: '88' } }, root, now });
  assert.equal(created.store, 'shop-a');
  assert.equal(created.confirmationCode.length, 6);
  const authorized = authorizeMutationPlan({ planId: created.planId, confirmationCode: created.confirmationCode, store, root, now: new Date(now.getTime() + 1000) });
  assert.equal(authorized.action, 'agent.mutation.execute');
  assert.equal(authorized.payload.target.itemId, '88');
  assert.equal(authorized.workflow.steps.at(-1), 'read-back-publication-status');
  assert.throws(() => authorizeMutationPlan({ planId: created.planId, confirmationCode: created.confirmationCode, store, root, now }), /already been applied/);
});

test('mutation plan rejects wrong code, identity, expiration and tampering', () => {
  const { root, store, now } = fixture();
  const first = createMutationPlan({ capabilityId: 'video-publish-item', store, payload: { itemId: '1', video: { path: 'video.mp4' } }, root, now });
  assert.throws(() => authorizeMutationPlan({ planId: first.planId, confirmationCode: '000000', store, root, now }), /incorrect/);
  assert.throws(() => authorizeMutationPlan({ planId: first.planId, confirmationCode: first.confirmationCode, store: { ...store, identity: { stableId: '2002' } }, root, now }), /identity/);
  assert.throws(() => authorizeMutationPlan({ planId: first.planId, confirmationCode: first.confirmationCode, store, root, now: new Date(now.getTime() + 16 * 60 * 1000) }), /expired/);

  const second = createMutationPlan({ capabilityId: 'sucai-apply', store, payload: { materials: ['m1'], target: { itemId: '1' } }, root, now });
  const plan = readMutationPlan(second.planId, root);
  plan.payload.materials[0] = 'changed';
  fs.writeFileSync(path.join(root, 'plans', `${second.planId}.json`), JSON.stringify(plan));
  assert.throws(() => authorizeMutationPlan({ planId: second.planId, confirmationCode: second.confirmationCode, store, root, now }), /integrity/);
});

test('audit log contains digests but not mutation payload values', () => {
  const { root, store, now } = fixture();
  createMutationPlan({ capabilityId: 'qianniu-product-batch-draft', store, payload: { products: [{ title: 'A' }], passwordLikeSecret: 'DO_NOT_LOG' }, root, now });
  const audit = fs.readFileSync(path.join(root, 'audit', 'mutations.jsonl'), 'utf8');
  assert.doesNotMatch(audit, /DO_NOT_LOG/);
  assert.match(audit, /payloadDigest/);
});

test('mutation plans enforce workflow-specific required inputs', () => {
  const { root, store, now } = fixture();
  assert.throws(() => createMutationPlan({ capabilityId: 'video-publish-item', store, payload: { itemId: '1' }, root, now }), /missing: video/);
});
