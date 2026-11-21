import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(root, '.github/workflows/public-browser-qa.yml'), 'utf8');

test('full candidate browser QA is parallelized into four safe independent shards', () => {
  assert.match(workflow, /suite:\s*\[core-desktop, core-mobile, visuals, accounts\]/);
  assert.match(workflow, /fail-fast:\s*false/);
  assert.match(workflow, /candidate-browser-qa-\$\{\{ matrix\.suite \}\}/);
  assert.match(workflow, /USD_BROWSER_SUITE: \$\{\{ matrix\.suite \}\}/);
  assert.match(workflow, /npm test/);
});

test('every original browser QA and offline boundary step remains exactly once and has its shard gate', () => {
  const part = workflow.split('  candidate-accessibility:')[0];
  const scripts = {
    'core-desktop': [
      'admin-drawer-swipe-browser-qa.mjs',
      'admin-navigation-browser-qa.mjs',
      'stage-actions-browser-qa.mjs',
      'public-browser-read-recheck.test.mjs',
      'online-release-preflight.test.mjs',
      'browser-qa-routing-regression.mjs',
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
  assert.match(workflow, /USD_CANDIDATE_QA_WIDTHS:/);
  assert.match(workflow, /390,320/);
  assert.match(workflow, /1440,1024/);
  assert.match(part, /if: matrix\.suite == 'core-desktop' \|\| matrix\.suite == 'core-mobile'\n\s+run: node scripts\/candidate-browser-qa\.mjs/);
  assert.equal((part.match(/run: node scripts\/candidate-browser-qa\.mjs/g) || []).length, 1);
  const allSteps = [...part.matchAll(/^\s+- name: ([^\n]+)\n\s+if: matrix\.suite == '([^']+)'\n(?:\s+env:[^\n]*\n(?:\s+[^\n]*\n)*?)?\s+run: node (?:--test )?scripts\/([^\s\n]+)/gm)];
  assert.equal(allSteps.filter(x => x[3] === 'public-browser-qa-matrix.test.mjs' && x[2] === 'core-desktop').length, 1);
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
  assert.match(workflow, /if \[ "\$USD_BROWSER_SUITE" = "core-desktop" \]; then npm test; fi/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /name: candidate-browser-qa-\$\{\{ matrix\.suite \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /timeout-minutes:\s*30/);
});

test('team directory and season comparison are tested as separate, accessible screens on both browser widths', () => {
  const candidate = readFileSync(path.join(root, 'scripts/candidate-browser-qa.mjs'), 'utf8');
  const start = candidate.indexOf("if(role===null&&route==='/teams'){");
  const end = candidate.indexOf("if(role===null&&(route==='/cars/car1'", start);
  assert.ok(start >= 0 && end > start, 'team QA must stay in both public browser matrix suites');
  const teamJourney = candidate.slice(start, end);
  const catalog = "getByRole('button',{name:'Каталог команд'})";
  const results = "getByRole('button',{name:'Результаты по этапам и сезонам'})";
  const standings = "getByRole('button',{name:/Показать выступления · USD Team/})";
  assert.match(teamJourney, /\.team-public-directory/, 'verify directory on the initial catalog screen');
  assert.match(teamJourney, /\.p-team-card/, 'directory should show actual team links');
  assert.match(teamJourney, /\.team-standings/, 'keep season and stage protocol assertions');
  assert.ok(teamJourney.indexOf(catalog) !== -1, 'check the catalog tab');
  assert.ok(teamJourney.indexOf(results) !== -1, 'check the results tab');
  assert.ok(teamJourney.indexOf('await resultsTab.click();') > 0 && teamJourney.indexOf('await resultsTab.click();') < teamJourney.indexOf(standings),
    'open the results tab before inspecting the standings');
  assert.ok(teamJourney.lastIndexOf('await catalogTab.click();') > teamJourney.indexOf(standings),
    'return to the catalog and verify it remains accessible');
  const measurementAssertion=teamJourney.match(/assert\.match\(await comparison\.innerText\(\),\/([^/]+)\/,'MPS values remain distinct/);
  assert.ok(measurementAssertion,'keep an actual result measurement check after expanding a team');
  const measurementPattern=new RegExp(measurementAssertion[1]);
  assert.match('30.500 м/с',measurementPattern,'the browser QA regex must accept actual MPS result');
  assert.doesNotMatch('30x500 м/с',measurementPattern,'decimal separator must be treated literally');
});

test('candidate checks authorize the exact main SHA and deployed browser checks follow a confirmed release',()=>{
  const live=readFileSync(path.join(root,'.github/workflows/deployed-public-browser-qa.yml'),'utf8');
  assert.match(workflow,/push:\n    branches: \[main\]/);
  assert.match(workflow,/candidate-accessibility:/);
  assert.doesNotMatch(workflow,/live-public-layout:|run: node scripts\/public-browser-qa\.mjs/);
  assert.match(live,/workflows: \[Request USD home-PC deploy after images and main checks\]/);
  assert.match(live,/workflow_run\.conclusion == 'success'/);
  assert.match(live,/width: \[1440, 390\]/);
  assert.match(live,/run: node scripts\/public-browser-qa\.mjs/);
  assert.doesNotMatch(live,/continue-on-error|self-hosted/);
});
