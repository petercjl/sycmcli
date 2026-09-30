import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { capabilities } from '../src/capabilities.mjs';

const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json');

test('reports package identity from the npm package metadata', () => {
  assert.equal(capabilities.package, packageMetadata.name);
  assert.equal(capabilities.version, packageMetadata.version);
});
