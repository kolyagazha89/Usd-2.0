import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(root, '.github/workflows/public-browser-qa.yml'), 'utf8');

test('full candidate browser QA is parallelized into three safe independent shards', () => {
  assert.match(workflow, /suite:\s*\[core, visuals, accounts\]/);
  assert.match(workflow, /fail-fast:\s*false/);
  assert.match(workflow, /candidate-browser-qa-\$\{\{ matrix\.suite \}\}/);
  assert.match(workflow, /USD_BROWSER_SUITE: \$\{\{ matrix\.suite \}\}/);
  assert.match(workflow, /npm test/);
});

test('every original browser QA and offline boundary step remains exactly once and has its shard gate', () => {
  const part = workflow.split('  live-public-layout:')[0];
  const scripts = {
    core: [
      'admin-drawer-swipe-browser-qa.mjs',
      'admin-navigation-browser-qa.mjs',
      'stage-actions-browser-qa.mjs',
      'public-browser-read-recheck.test.mjs',
      'online-release-preflight.test.mjs',
      'browser-qa-routing-regression.mjs',
      'candidate-browser-qa.mjs',
    ],
    visuals: [
      'safe-area-browser-qa.mjs',
      'css-cascade-browser-qa.mjs',
      'home-logo-browser-qa.mjs',
      'partner-image-browser-qa.mjs',
      'rules-browser-qa.mjs',
    ],
    accounts: [
      'team-management-browser-qa.mjs',
      'simple-team-browser-qa.mjs',
      'account-security-browser-qa.mjs',
      'verification-resend-browser-qa.mjs',
    ],
  };
  const expected = Object.values(scripts).flat();
  const allSteps = [...part.matchAll(/^\s+- name: ([^\n]+)\n\s+if: matrix\.suite == '([^']+)'\n(?:\s+env:[^\n]*\n(?:\s+[^\n]*\n)*?)?\s+run: node (?:--test )?scripts\/([^\s\n]+)/gm)];
  assert.equal(allSteps.filter(x => x[3] === 'public-browser-qa-matrix.test.mjs' && x[2] === 'core').length, 1);
  const steps = allSteps.filter(x => x[3] !== 'public-browser-qa-matrix.test.mjs');
  assert.equal(steps.length, expected.length, 'every browser invocation must be gated and retained');
  const got = steps.map(x => x[3]);
  assert.equal(new Set(got).size, expected.length, 'no duplicate browser runs');
  for (const [suite, filenames] of Object.entries(scripts)) {
    for (const filename of filenames) {
      const matching = steps.filter(x => x[2] === suite && x[3] === filename);
      assert.equal(matching.length, 1, filename + ' must run exactly once in ' + suite);
    }
  }
});

test('all candidate shards independently build and keep screenshot artifacts', () => {
  assert.match(workflow, /if \[ "\$USD_BROWSER_SUITE" = "core" \]; then npm test; fi/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /name: candidate-browser-qa-\$\{\{ matrix\.suite \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /timeout-minutes:\s*30/);
});
