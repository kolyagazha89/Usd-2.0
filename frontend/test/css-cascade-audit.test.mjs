import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src');
const read=relative=>readFile(path.join(base,relative),'utf8');
async function cssFiles(dir=base){
 const entries=await readdir(dir,{withFileTypes:true});
 const paths=await Promise.all(entries.map(async entry=>{
  const full=path.join(dir,entry.name);
  return entry.isDirectory()?cssFiles(full):entry.isFile()&&entry.name.endsWith('.css')?[full]:[];
 }));
 return paths.flat();
}
function rules(css,source){
 const ast=postcss.parse(css,{from:source});const result=[];
 ast.walkRules(rule=>result.push({selector:rule.selector,decls:rule.nodes.filter(node=>node.type==='decl')}));
 return result;
}
function propertyBlock(r,property){
 return r.decls.find(x=>x.prop===property)?.value??null;
}

test('all frontend stylesheets parse, with no malformed blocks or missing imports',async()=>{
 const files=await cssFiles();
 assert.ok(files.length>=28,'all public, participant and admin stylesheets included');
 for(const file of files){assert.ok(postcss.parse(await readFile(file,'utf8'),{from:file}).nodes.length>0,'CSS parsed: '+file)}
 const main=await read('main.tsx');
 assert.ok(main.includes("import './admin/admin-shell-layout.css'"),'admin shell stylesheet still included');
 assert.ok(main.indexOf("'./dark-velocity-sitewide.css'")<main.indexOf("'./admin/admin-shell-layout.css'"),'admin finish imported after public CSS');
});

test('side navigation has exactly one stylesheet owner — no legacy multi-layer paint or surprise public nav grid',async()=>{
 const [baseCss,ui,publicCss,admin]=await Promise.all([
  read('styles.css'),read('ui-consistency.css'),read('dark-velocity-sitewide.css'),read('admin/admin-shell-layout.css')
 ]);
 for(const [file,source] of [['styles.css',baseCss],['ui-consistency.css',ui],['dark-velocity-sitewide.css',publicCss]]){
  const offenders=rules(source,file).filter(rule=>/\.(?:sidebar|sidebar-top|sidebar-bottom|sidebar-section|sidebar-label|nav-item)(?:\b|\W)/.test(rule.selector));
  assert.deepEqual(offenders.map(x=>x.selector),[],'sidebar CSS must be owned by admin/admin-shell-layout.css, not '+file);
 }
 const adminRules=rules(admin,'admin/admin-shell-layout.css');
 const aside=adminRules.find(rule=>rule.selector.trim()==='body .app-shell > .sidebar'&&propertyBlock(rule,'background')?.includes('#17181d'));
 assert.ok(aside,'admin sidebar has an explicit solid graphite surface');
 assert.equal(propertyBlock(aside,'background-image'),'none','no gradient or pattern behind menu');
 const inner=adminRules.find(rule=>rule.selector.includes('.sidebar-top,nav,.sidebar-section,.sidebar-bottom'));
 assert.ok(inner&&propertyBlock(inner,'background')?.includes('transparent'),'brand, nav, groups and footer use the same surface');
 const active=adminRules.find(rule=>rule.selector.includes('.nav-item[aria-current="page"]'));
 assert.ok(active&&propertyBlock(active,'background')?.includes('#32181e'),'active entry has quiet burgundy, not blue');
 assert.ok(!rules(baseCss,'styles.css').some(rule=>rule.selector.split(',').some(part=>part.trim()==='nav')),'generic nav must never enforce a grid on public navigation');
 assert.ok(!/\.sidebar\s*\{[\s\S]*?radial-gradient/.test(baseCss),'legacy red radial sidebar removed');
});

test('light admin has white inputs and panels, public/member own dark color scheme with no CSS bleed',async()=>{
 const [baseCss,publicCss,admin]=await Promise.all([read('styles.css'),read('dark-velocity-sitewide.css'),read('admin/admin-shell-layout.css')]);
 assert.ok(!publicCss.includes('body .app-shell'),'Dark Velocity must not style admin pages');
 assert.ok(!baseCss.includes(':where(.app-shell,.page,.panel,.login-page'),'unscoped dark controls cannot leak into admin');
 assert.ok(!baseCss.includes('.app-shell:not(:has(.admin-records-page))'),'records page must not be excluded from light admin design');
 assert.ok(!baseCss.includes('.app-shell [class*="-card"]'),'no wildcard repaint of every card');
 assert.ok(!rules(baseCss,'styles.css').some(rule=>rule.selector.split(',').some(part=>part.trim()==='*')&&rule.decls.some(d=>d.prop.startsWith('scrollbar'))),'no global white scrollbar forcing across dark site');
 assert.match(publicCss,/--usd-public-gutter:clamp\(12px,4vw,30px\)/,'shared public gutters defined');
 assert.match(publicCss,/color-scheme:dark/,'public/member dark control color scheme');
 assert.match(admin,/--usd-admin-paper:#ffffff/,'admin paper white');
 assert.match(admin,/color-scheme:light/,'admin fields native light');
 assert.match(admin,/\.form-intro,\.registration-rules-consent,\.searchable-select-menu/,'helper fields explicitly light');
 assert.match(admin,/\.record-visibility-panel/,'records fully normalized to light surfaces');
 assert.match(admin,/overflow-x:\s*clip/,'no body horizontal scrollbar in admin');
});

test('all staff-only paint is defined once in the final admin sheet; shared finish sheets cannot repaint staff screens',async()=>{
 const [finish,premium,admin,entry]=await Promise.all([
  read('sitewide-finish.css'),read('sitewide-premium-2026.css'),
  read('admin/admin-shell-layout.css'),read('main.tsx'),
 ]);
 for(const [name,css] of [['sitewide-finish.css',finish],['sitewide-premium-2026.css',premium]]){
  const leaked=rules(css,name).filter(rule=>/(?:body\\s+)?\\.app-shell(?:\\s|\\.|>|:)/.test(rule.selector));
  assert.deepEqual(leaked.map(x=>x.selector),[],
   name+' may keep shared :is(.usd-live,.usd-member,.app-shell) tokens but not staff-specific paint');
 }
 for(const selector of [
  '.mail-channel-status', '.mail-test-result', '.settings-section',
  '.data-table,.smart-table', '.page-heading h1',
 ]){
  assert.ok(admin.includes(selector),'final staff sheet owns '+selector);
 }
 const pos=entry.indexOf("import './admin/admin-shell-layout.css'");
 assert.ok(pos>entry.indexOf("import './sitewide-premium-2026.css'"));
 assert.ok(pos>entry.indexOf("import './sitewide-finish.css'"));
 assert.ok(!finish.includes('body .app-shell .main'));
 assert.ok(!premium.includes('body .app-shell .main'));
 const commandDesk=rules(admin,'admin/admin-shell-layout.css').find(rule=>rule.selector.trim()==='body .app-shell .main .event-ops-workflow-context');
 assert.ok(commandDesk,'event day desk still exists in the admin-only stylesheet');
 assert.match(propertyBlock(commandDesk,'background')??'',/#ffffff.*#f8f9fb/,'judge workflow intro uses pearly-white background, not black fields');
 assert.equal(propertyBlock(commandDesk,'color'),'#232730','judge workflow label remains graphite');
});
