import {readFile,stat} from 'node:fs/promises';
const manifest=JSON.parse(await readFile(new URL('../dist/.vite/manifest.json',import.meta.url),'utf8'));
const entry=Object.keys(manifest).find(key=>manifest[key].isEntry);
if(!entry)throw new Error('Missing application entry');
const visited=new Set();let bytes=0;
async function visit(key){if(visited.has(key))return;visited.add(key);const chunk=manifest[key];if(!chunk)throw new Error('Missing static chunk '+key);if(/AdminRoutes|ImportPage|InspectionsPage|xlsx/.test(chunk.file))throw new Error('Administrative code entered the public graph: '+chunk.file);bytes+=(await stat(new URL('../dist/'+chunk.file,import.meta.url))).size;for(const dep of chunk.imports??[])await visit(dep)}
await visit(entry);
if(bytes>650_000)throw new Error('Public JavaScript exceeds 650 kB budget: '+bytes);
console.log('Public static JavaScript: '+bytes+' bytes; budget 650000. Administrative routes are deferred.');
