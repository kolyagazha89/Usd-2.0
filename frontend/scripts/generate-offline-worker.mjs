import {createHash} from 'node:crypto';
import {readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {join,relative,resolve,sep} from 'node:path';

/** Offline assets come from this exact Vite build, never a CDN or API.
 * The dedicated worker is scoped to /offline-event, separate from push.
 */
const root=resolve(import.meta.dirname,'..');
const dist=join(root,'dist');
const assetsDir=join(dist,'assets');
async function walk(dir){
 const entries=await readdir(dir,{withFileTypes:true});
 const files=[];
 for(const entry of entries){
  const full=join(dir,entry.name);
  if(entry.isDirectory())files.push(...await walk(full));
  else if(entry.isFile()&&!entry.name.endsWith('.map'))files.push(full);
 }
 return files;
}
const all=await walk(assetsDir);
const allowed=new Set(['.js','.css','.woff','.woff2','.png','.jpg','.jpeg','.svg','.webp','.avif']);
const files=all.filter(p=>allowed.has(p.slice(p.lastIndexOf('.')).toLowerCase())).map(p=>'/'+relative(dist,p).split(sep).join('/')).sort();
const staticFiles=['/index.html','/manifest.webmanifest',...files];
for(const path of staticFiles){
 const info=await stat(join(dist,path.slice(1)));
 if(!info.isFile())throw new Error('Required offline asset missing: '+path);
}
if(files.length===0||!files.some(p=>p.endsWith('.js'))||!files.some(p=>p.endsWith('.css')))
 throw new Error('Offline service worker needs emitted JS and CSS chunks.');
if(files.length>2500)throw new Error('Unexpected offline bundle size; review pre-cache assets.');
const template=await readFile(join(root,'scripts/offline-worker.template.js'),'utf8');
const version=createHash('sha256').update(staticFiles.join('\n')).digest('hex').slice(0,18);
const source=template.replace('__USD_OFFLINE_ASSETS__',JSON.stringify(staticFiles))
 .replace('__USD_OFFLINE_VERSION__',version);
if(source.includes('__USD_OFFLINE_'))throw new Error('Unreplaced offline worker marker');
await writeFile(join(dist,'usd-offline-sw.js'),source);
console.log('USD offline desk: generated '+files.length+' static assets, version '+version);
