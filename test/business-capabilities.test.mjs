import test from 'node:test';
import assert from 'node:assert/strict';
import { businessCapabilities, mutationCapabilities } from '../src/business-capabilities.mjs';

test('catalog contains exactly the 37 collected read and analysis capabilities', () => {
  assert.equal(businessCapabilities.length, 37);
  assert.equal(new Set(businessCapabilities.map((entry) => entry.id)).size, 37);
  assert.ok(businessCapabilities.every((entry) => entry.sideEffect === 'none'));
});

test('all mutation capabilities require plan and confirmation', () => {
  assert.equal(mutationCapabilities.length, 7);
  assert.ok(mutationCapabilities.every((entry) => entry.planRequired && entry.applyConfirmationRequired));
});
