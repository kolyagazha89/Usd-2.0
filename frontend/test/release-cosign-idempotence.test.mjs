import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,chmodSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../../deploy/home-pc/sign-published-image.sh',import.meta.url));
const good={
 USD_IMAGE:'ghcr.io/kolyagazha89/usd-2.0-frontend',
 USD_DIGEST:'sha256:'+'a'.repeat(64),
 USD_SOURCE_SHA:'b'.repeat(40),
};
const mock=`#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$USD_TEST_LOG"
if [[ "$1" == sign ]]; then
 case "$USD_TEST_SIGN" in
  ok) exit 0;;
  conflict) echo '409 createLogEntryConflict: an equivalent entry already exists in the transparency log' >&2; exit 1;;
  other-conflict) echo '409 createLogEntryConflict: some different entry exists' >&2; exit 1;;
  bad) echo 'authorization failed: unexpected remote error' >&2; exit 1;;
 esac
fi
if [[ "$1" == verify ]]; then
 if [[ "$USD_TEST_VERIFY" == ok ]]; then exit 0; fi
 echo 'no valid OIDC signatures' >&2
 exit 1
fi
exit 98
`;

function run({sign='ok',verify='ok',vars={}}={}){
 const dir=mkdtempSync(path.join(tmpdir(),'usd-sign-replay-'));
 try{
  const tool=path.join(dir,'cosign');
  writeFileSync(tool,mock);chmodSync(tool,0o755);
  const log=path.join(dir,'calls');
  const env={...process.env,PATH:dir+':'+process.env.PATH,USD_TEST_LOG:log,USD_TEST_SIGN:sign,USD_TEST_VERIFY:verify,...good,...vars};
  let result;
  try{
   result={ok:true,output:execFileSync('bash',[script],{encoding:'utf8',env,stdio:['ignore','pipe','pipe']})};
  }catch(error){
   result={ok:false,output:String(error.stderr??''),exit:error.status};
  }
  const calls=readFileSync(log,{encoding:'utf8',flag:'a+'}).split('\n').filter(Boolean);
  return {...result,calls};
 }finally{rmSync(dir,{recursive:true,force:true})}
}

test('normal publish signs and verifies exact digest, main workflow identity and source sha',()=>{
 const {ok,calls}=run();
 assert.equal(ok,true);
 assert.equal(calls.length,2);
 assert.match(calls[0],/^sign --yes -a git_sha=b{40} ghcr\.io\/kolyagazha89\/usd-2\.0-frontend@sha256:a{64}$/);
 assert.match(calls[1],/^verify --certificate-identity https:\/\/github\.com\/kolyagazha89\/Usd-2\.0\/\.github\/workflows\/publish-home-pc-images\.yml@refs\/heads\/main/);
 assert.match(calls[1],/--certificate-oidc-issuer https:\/\/token\.actions\.githubusercontent\.com/);
 assert.match(calls[1],/git_sha=b{40}/);
});

test('only equivalent Rekor entry 409 is tolerated and still requires successful verification',()=>{
 const goodReplay=run({sign:'conflict'});
 assert.equal(goodReplay.ok,true);
 assert.equal(goodReplay.calls.length,2);
 const verifyRejected=run({sign:'conflict',verify:'bad'});
 assert.equal(verifyRejected.ok,false);
 assert.equal(verifyRejected.calls.length,2);
});

test('reject unrelated signing errors and non-equivalent transparency-log conflicts',()=>{
 for(const sign of ['bad','other-conflict']){
  const result=run({sign});
  assert.equal(result.ok,false);
  assert.equal(result.calls.length,1,'must not verify after unrecognized failure');
 }
});

test('reject invalid signatures even when signing succeeds',()=>{
 const result=run({sign:'ok',verify:'bad'});
 assert.equal(result.ok,false);
 assert.equal(result.calls.length,2);
});

test('reject wrong digest, source commit, or image repository before invoking cosign',()=>{
 for(const vars of [
  {USD_DIGEST:'sha256:wrong'},
  {USD_SOURCE_SHA:'main'},
  {USD_IMAGE:'ghcr.io/other/untrusted'},
  {USD_IMAGE:'ghcr.io/kolyagazha89/usd-2.0-frontend-extra'},
 ]){
  const result=run({vars});
  assert.equal(result.ok,false,JSON.stringify(vars));
  assert.equal(result.calls.length,0,JSON.stringify(vars));
 }
});

test('publisher workflow calls the verified release helper',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/publish-home-pc-images.yml',import.meta.url),'utf8');
 assert.match(workflow,/bash deploy\/home-pc\/sign-published-image\.sh/);
 assert.match(workflow,/id-token: write/);
 assert.match(workflow,/\$\{\{ steps\.build\.outputs\.digest \}\}/);
});
