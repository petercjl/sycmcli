import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, integerFlag } from '../src/args.mjs';

test('parseArgs separates commands and flags', () => {
  const parsed = parseArgs(['item', 'rank', '--store', 'shop-a', '--top=100', '--force']);
  assert.deepEqual(parsed.positionals, ['item', 'rank']);
  assert.deepEqual(parsed.flags, { store: 'shop-a', top: '100', force: true });
});

test('integerFlag validates bounds', () => {
  assert.equal(integerFlag({ page: '20' }, 'page', 1, { max: 20 }), 20);
  assert.throws(() => integerFlag({ page: '21' }, 'page', 1, { max: 20 }), /must be an integer/);
});
