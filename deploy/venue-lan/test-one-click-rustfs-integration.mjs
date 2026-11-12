/** Exercises real RustFS ONLY in the disposable GitHub Actions venue DB test. */
import {readFile} from 'node:fs/promises';
import {setupRustfs} from './one-click-runner.mjs';
if(process.env.USD_VENUE_ONECLICK_CI_RUSTFS!=='true')
 throw Error('Only disposable CI may invoke this RustFS integration probe');
const lines=(await readFile(new URL('./.env',import.meta.url),'utf8')).split(/\r?\n/);
const env={};
for(const line of lines){
 if(!line||line.startsWith('#'))continue;
 const i=line.indexOf('=');
 if(i<1)throw Error('Invalid CI venue env');
 env[line.slice(0,i)]=line.slice(i+1);
}
if(env.VENUE_DB_NAME!=='usd_venue'||env.VENUE_S3_ROOT_ACCESS!=='venue-root-ci')
 throw Error('Refusing to provision media outside fixed disposable CI fixture');
await setupRustfs(env);
console.log('USD one-click RustFS PASS: bucket created, media key scoped, administration denied');
