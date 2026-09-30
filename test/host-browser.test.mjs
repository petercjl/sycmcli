import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHostBrowserScript } from '../src/host-browser.mjs';

test('builds a self-contained native-browser evaluate function', () => {
  const script = buildHostBrowserScript('category-search', { keyword: '奶锅', leafOnly: true });
  assert.match(script, /^async \(\) =>/);
  assert.match(script, /category-search/);
  assert.match(script, /credentials: 'include'/);
  assert.doesNotMatch(script, /cookie\s*:/i);
});
