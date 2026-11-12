#!/usr/bin/env node
/**
 * Provision an independent, persistent Ed25519 signing identity for one
 * offline laptop. The private key never leaves the Docker-only named volume.
 * This command must run disconnected (--network none) for first provisioning.
 */
import {
  createHash,createPrivateKey,createPublicKey,generateKeyPairSync,
} from 'node:crypto';
import {chmod,chown,lstat,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const SHA=/^[a-f0-9]{64}$/;
async function exists(path){
 try{return await lstat(path)}catch(e){if(e?.code==='ENOENT')return null;throw e}
}
async function requireDirectory(path,create=false){
 let stat=await exists(path);
 if(!stat&&create){await mkdir(path,{mode:0o700,recursive:true});stat=await lstat(path)}
 if(!stat||!stat.isDirectory()||stat.isSymbolicLink())
  throw Error('Ожидалась защищённая папка без символических ссылок');
}
async function matchOrCreate(path,value,mode){
 const stat=await exists(path);
 if(stat){
  if(!stat.isFile()||stat.isSymbolicLink()||(await readFile(path,'utf8'))!==value)
   throw Error('Уже существует другой ключ или повреждённый файл');
 }else{
  await writeFile(path,value,{flag:'wx',mode});
 }
}
export async function ensureVenueReturnKeys(keysDir,publicDir,{runtimeUid=1000}={}){
 if(typeof keysDir!=='string'||typeof publicDir!=='string'
  ||resolve(keysDir)===resolve(publicDir))
  throw Error('Нужны две отдельные папки для секретного и открытого ключа');
 await requireDirectory(keysDir,true);
 await requireDirectory(publicDir,true);
 const privatePath=join(keysDir,'venue-return-private.pem');
 const publicPath=join(keysDir,'venue-return-public.pem');
 const a=await exists(privatePath),b=await exists(publicPath);
 if(Boolean(a)!==Boolean(b))throw Error('Неполная пара ключей; автоматическая перегенерация запрещена');
 let pem,publicPem;
 if(a){
  if(!a.isFile()||a.isSymbolicLink()||(a.mode&0o077))
   throw Error('Закрытый ключ имеет небезопасные права');
  pem=await readFile(privatePath,'utf8');
  publicPem=await readFile(publicPath,'utf8');
 }else{
  const pair=generateKeyPairSync('ed25519');
  pem=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
  publicPem=pair.publicKey.export({type:'spki',format:'pem'}).toString();
  await writeFile(privatePath,pem,{flag:'wx',mode:0o600});
  await writeFile(publicPath,publicPem,{flag:'wx',mode:0o644});
 }
 const privateKey=createPrivateKey(pem),publicKey=createPublicKey(publicPem);
 const truePublic=createPublicKey(privateKey);
 if(privateKey.asymmetricKeyType!=='ed25519'||publicKey.asymmetricKeyType!=='ed25519'
  ||!publicKey.export({type:'spki',format:'der'}).equals(truePublic.export({type:'spki',format:'der'})))
  throw Error('Несовпадающая пара ключей: экспорт запрещён');
 const fingerprint=createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex');
 if(!SHA.test(fingerprint))throw Error('Ошибка отпечатка ключа');
 await matchOrCreate(join(publicDir,'USD-Venue-Return-Public.pem'),publicPem,0o644);
 await matchOrCreate(join(publicDir,'USD-Venue-Return-Fingerprint.txt'),fingerprint+'\n',0o644);
 if(typeof process.getuid==='function'&&process.getuid()===0){
  for(const path of [keysDir,privatePath,publicPath])await chown(path,runtimeUid,runtimeUid);
 }
 await chmod(keysDir,0o700);
 await chmod(privatePath,0o600);
 return {fingerprint,publicKey:join(publicDir,'USD-Venue-Return-Public.pem')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [keysDir,publicDir]=process.argv.slice(2);
 ensureVenueReturnKeys(keysDir,publicDir).then(r=>{
  process.stdout.write('USD VENUE RETURN PUBLIC KEY READY\n');
  process.stdout.write('TRUSTED SHA256 FINGERPRINT: '+r.fingerprint+'\n');
 }).catch(()=>{
  console.error('USD RETURN KEY PROVISIONING REFUSED. Existing secrets were NOT overwritten.');
  process.exitCode=1;
 });
}
