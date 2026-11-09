import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = file => readFile(new URL(file,import.meta.url),'utf8');

test('dark vehicle configuration rules cannot style the light admin workspace',async()=>{
 const [skin,component]=await Promise.all([
  source('../src/participant-ui-polish.css'),
  source('../src/admin/ConfigurationsPage.tsx'),
 ]);
 assert.match(component,/admin\?["']admin-configurations-shell["']/,
  'admin rendering must not mount the public/participant dark theme roots');
 for(const selector of [
  'configuration-editor-page .config-editor-intro',
  'configuration-editor-page .catalog-request-inline',
  'configuration-editor-page .configuration-admission-guide',
  'configuration-editor-page .config-section',
  'configurations-page .config-card',
  'configuration-details-page .config-details-hero',
 ]){
  assert.ok(!skin.includes('\n.'+selector+'{')&&!skin.includes('\n.'+selector+' {'),
   'unscoped dark selector leaks into the admin screen: '+selector);
 }
 assert.match(skin,/\.usd-member \.configuration-editor-page \.config-editor-intro/,
  'member dark styles must have an explicit member ancestor');
});

test('member bottom navigation has a stable size and immediately matches mobile viewport',async()=>{
 const [nav,theme]=await Promise.all([
  source('../src/participant/ParticipantNavigation.tsx'),
  source('../src/public/premium-member.css'),
 ]);
 assert.match(nav,/useSyncExternalStore/,
  'viewport match state must be consistent at first render, not reparented by useEffect');
 assert.match(theme,/--usd-member-dock-size:calc\(/);
 assert.match(theme,/body\s*>\s*\.participant-tabs\s*\{[\s\S]*?height:var\(--usd-member-dock-size\)/,
  'portaled navigation must reserve stable height while initial data/fonts load');
 assert.match(theme,/body\s*>\s*\.participant-tabs\s*\{[\s\S]*?transform:none!important/,
  'a fixed dock must not also be transformed on iOS');
});