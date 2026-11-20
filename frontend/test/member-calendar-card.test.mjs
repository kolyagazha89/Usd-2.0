import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('member calendar stages are distinct cards with stable desktop columns', async () => {
 const [css, dashboard] = await Promise.all([
  read('../src/participant/member-experience.css'),
  read('../src/participant/MemberDashboard.tsx'),
 ]);
 assert.match(dashboard, /className="member-more-stages"/,
  'the dashboard should render the stages using the calendar card styles');
 const desktop = [...css.matchAll(/body \.participant-portal\.usd-member \.member-more-stages>article\{([^}]+)\}/g)][0]?.[1] ?? '';
 assert.match(desktop, /display:grid/, 'card layout should not rely on a wrapping flex row');
 assert.match(desktop, /grid-template-columns:/, 'date, stage and action need predictable columns');
 assert.match(desktop, /background:#141920/, 'stage items must not look like unstyled black strips');
 assert.match(desktop, /border:1px solid #2a313c/, 'stage cards need the member theme border');
 assert.match(desktop, /border-radius:12px/, 'stage cards need the member theme radius');
});

test('member calendar stacks date, details and compact action on narrow phones', async () => {
 const css = await read('../src/participant/member-experience.css');
 const articleRules = [...css.matchAll(/body \.participant-portal\.usd-member \.member-more-stages>article\{([^}]+)\}/g)];
 assert.equal(articleRules.length, 2, 'there should be one desktop and one mobile card rule');
 const mobile = articleRules[1][1];
 assert.match(mobile, /grid-template-columns:minmax\(0,1fr\)/,
  'phone layout should be one column, without squeezing the title beside the date');
 assert.match(mobile, /grid-template-areas:"date" "details" "action"/,
  'date, stage details and CTA should follow a predictable reading order');
 assert.doesNotMatch(mobile, /flex-wrap/, 'avoid the wrapping flex layout that caused the misalignment');
 const cta = [...css.matchAll(/body \.participant-portal\.usd-member \.member-more-stages>article \.secondary-button\{([^}]+)\}/g)][0]?.[1] ?? '';
 assert.match(cta, /width:max-content/, 'CTA should not fill the entire card on iPhone');
 assert.match(cta, /justify-self:end/, 'CTA should align with the end of the card');
});
