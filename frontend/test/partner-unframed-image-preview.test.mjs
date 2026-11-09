import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToString} from 'react-dom/server';

const dir=path.dirname(fileURLToPath(import.meta.url));
const source=path=>readFile(new URL(path,import.meta.url),'utf8');
const TIERS=['GENERAL','PREMIUM','REGULAR','STUDIO'];

test('admin renders four individually labelled real-card previews and prioritizes the selected tier',async()=>{
 const scratch=await mkdtemp(path.join(dir,'.partner-image-previews-'));
 try{
  const outfile=path.join(scratch,'preview.mjs');
  await build({entryPoints:[path.join(dir,'../src/admin/PartnerImageEditor.tsx')],
   bundle:true,format:'esm',platform:'node',jsx:'automatic',packages:'external',
   loader:{'.css':'empty'},outfile});
  const {default:Editor}=await import(pathToFileURL(outfile).href);
  const callbacks={onChange:()=>{},onValidityChange:()=>{}};
  for(const tier of TIERS){
   const html=renderToString(React.createElement(Editor,{...callbacks,
    photoUrl:'/qa-partner-image',name:'Тестовый партнёр',tier,disabled:false,
    value:{mode:'LOGO',aspectWidth:3,aspectHeight:2,scale:100,positionX:50,positionY:50}}));
   assert.equal((html.match(/data-preview-tier="/g)??[]).length,4,html);
   assert.equal((html.match(/class="usd-partner-visual /g)??[]).length,4,'use actual public visual class');
   for(const expected of TIERS){
    assert.match(html,new RegExp('data-preview-tier="'+expected+'"'));
    assert.match(html,new RegExp('usd-partner-card--'+expected.toLowerCase()));
   }
   assert.match(html,new RegExp('data-preview-tier="'+tier+'"[^>]*data-selected="true"'));
   const first=html.match(/data-preview-tier="([^"]+)"/)?.[1];
   assert.equal(first,tier,'current category must be first to preserve editor preview continuity');
   assert.match(html,/name="imageAspect"/,'keep aspect editor');
   assert.match(html,/name="imageMode"/,'keep logo/banner switch');
  }
 }finally{await rm(scratch,{recursive:true,force:true})}
});

test('photos are rounded without an enclosing dark image plaque, while all 4 cards retain a consistent image slot',async()=>{
 const [imageCss,adminCss,publicCss,component]=await Promise.all([
  source('../src/public/partner-image.css'),
  source('../src/admin/admin-shell-layout.css'),
  source('../src/dark-velocity-sitewide.css'),
  source('../src/public/PartnerImage.tsx'),
 ]);
 assert.match(imageCss,/\.usd-partner-showcase \.usd-partner-visual[\s\S]*?background:transparent/);
 assert.match(imageCss,/\.partner-image-legacy[\s\S]*?background:transparent/);
 assert.match(imageCss,/img\.partner-image-content[\s\S]*?border-radius/);
 assert.match(imageCss,/img\.partner-image-legacy-content[\s\S]*?border-radius/);
 assert.match(publicCss,/--usd-partner-slot-height/,'uniform visual slots remain in place');
 assert.match(component,/aspectRatio:/,'custom image ratio is preserved');
 assert.match(adminCss,/\.partner-image-preview-gallery/);
 assert.match(adminCss,/\.partner-image-preview-item/);
});
