import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { skillSource, skillStatus } from '../src/skill-manager.mjs';

test('bundled skill is canonical and contains no placeholders', () => {
  const source = skillSource();
  const text = fs.readFileSync(path.join(source, 'SKILL.md'), 'utf8');
  assert.match(text, /^---\nname: sycmcli\n/);
  assert.doesNotMatch(text, /\[TODO/);
  assert.equal(skillStatus('codex').source, source);
});
