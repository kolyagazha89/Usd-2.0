import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('permanent USD ID and existing registration QR remain distinct and same-origin',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url));
 const scratch=await mkdtemp(path.join(base,'.usd-id-'));
 try{
  const outfile=path.join(scratch,'qr.mjs');
  await build({entryPoints:[path.join(base,'../src/participant/usd-id.ts')],bundle:true,platform:'node',format:'esm',outfile});
  const {parseInspectionQr}=await import(pathToFileURL(outfile).href);
  const origin='https://app.usd-russia.ru';
  const token='a'.repeat(48);
  assert.deepEqual(parseInspectionQr(origin+'/usd-id/'+token,origin),{kind:'usd-id',token});
  assert.deepEqual(parseInspectionQr(origin+'/admin/inspections?stageId=stage&registrationId=registration',origin),{kind:'registration',stageId:'stage',registrationId:'registration'});
  assert.throws(()=>parseInspectionQr('https://attacker.example/usd-id/'+token,origin),/текущий сайт/);
  assert.throws(()=>parseInspectionQr(origin+'/usd-id/short',origin),/не QR-код USD/);
  assert.throws(()=>parseInspectionQr(origin+'/admin/inspections?stageId=stage',origin),/нет этапа/);
  assert.throws(()=>parseInspectionQr('javascript:alert(1)',origin),/текущий сайт/);
 }finally{await rm(scratch,{recursive:true,force:true})}
});
