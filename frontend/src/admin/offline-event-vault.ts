import {assertOfflinePackage,type OfflineEventPackage} from './offline-event-model.ts';

/** Offline vault lives only in IndexedDB. Neither tokens nor the passphrase
 * are stored. AES-GCM authenticates the full payload; PBKDF2 slows guessing
 * after a stolen device. Do not confuse a local draft with a server response.
 */
const DB_NAME='usd-offline-event-v1';
const STORE='vaults';
const KEY='active';
const ITERATIONS=310_000;
const MIN_PASSPHRASE_LENGTH=14;
export type EncryptedEventVault={
 id:'active';format:1;revision:string;salt:string;iv:string;ciphertext:string;
};
const encoder=new TextEncoder();
const decoder=new TextDecoder();
function toBase64(input:Uint8Array):string{
 let binary='';
 for(let i=0;i<input.length;i+=0x8000)
  binary+=String.fromCharCode(...input.subarray(i,i+0x8000));
 return btoa(binary);
}
function fromBase64(value:string):Uint8Array{
 return Uint8Array.from(atob(value),c=>c.charCodeAt(0));
}
function nonce(size:number):Uint8Array{
 const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return bytes;
}
async function derive(passphrase:string,salt:Uint8Array):Promise<CryptoKey>{
 const base=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey(
  {name:'PBKDF2',salt:Uint8Array.from(salt),iterations:ITERATIONS,hash:'SHA-256'},
  base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function sealOfflinePackage(
 data:OfflineEventPackage,passphrase:string,
):Promise<EncryptedEventVault> {
 assertOfflinePackage(data);
 if(passphrase.length<MIN_PASSPHRASE_LENGTH)
  throw new Error('Пароль пакета должен содержать минимум 14 символов.');
 const salt=nonce(16),iv=nonce(12),key=await derive(passphrase,salt);
 const cipher=await crypto.subtle.encrypt(
  {name:'AES-GCM',iv:Uint8Array.from(iv)},key,encoder.encode(JSON.stringify(data)));
 return {id:KEY,format:1,revision:crypto.randomUUID(),
  salt:toBase64(salt),iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(cipher))};
}
export async function unsealOfflinePackage(
 raw:EncryptedEventVault,passphrase:string,now=Date.now(),
):Promise<OfflineEventPackage>{
 if(!raw||raw.format!==1||raw.id!==KEY)throw new Error('Формат сохранённого пакета не поддерживается.');
 try{
  const key=await derive(passphrase,fromBase64(raw.salt));
  const plain=await crypto.subtle.decrypt(
   {name:'AES-GCM',iv:fromBase64(raw.iv)},key,fromBase64(raw.ciphertext));
  const value:unknown=JSON.parse(decoder.decode(plain));
  assertOfflinePackage(value,now);
  return value;
 }catch{
  throw new Error('Неверный пароль, повреждённый пакет или истёк срок действия (72 часа).');
 }
}
function openDb():Promise<IDBDatabase>{
 if(typeof indexedDB==='undefined')return Promise.reject(new Error('IndexedDB недоступен. Попробуйте открыть страницу в обычном защищённом браузере.'));
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(new Error('Не удалось открыть локальное защищённое хранилище.'));
  request.onblocked=()=>reject(new Error('Закройте другие вкладки USD, использующие автономный пакет.'));
 });
}
export async function loadEncryptedVault():Promise<EncryptedEventVault|null>{
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly');
  const result=tx.objectStore(STORE).get(KEY);
  result.onsuccess=()=>resolve(result.result??null);
  result.onerror=()=>reject(new Error('Не удалось прочитать локальный пакет.'));
  tx.oncomplete=()=>db.close();
  tx.onabort=()=>db.close();
 });
}
async function changeVault(
 next:EncryptedEventVault|null,expectedRevision:string|null,
):Promise<void>{
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  const store=tx.objectStore(STORE);
  const read=store.get(KEY);
  read.onsuccess=()=>{
   const found=read.result as EncryptedEventVault|undefined;
   if((found?.revision??null)!==expectedRevision){
    tx.abort();return;
   }
   if(next)store.put(next);else store.delete(KEY);
  };
  let completed=false;
  tx.oncomplete=()=>{completed=true;db.close();resolve()};
  tx.onabort=()=>{db.close();if(!completed)reject(new Error('Пакет изменён в другой вкладке. Повторно откройте сохранённые данные.'))};
  tx.onerror=()=>{db.close();reject(new Error('Не удалось сохранить зашифрованный пакет.'))};
 });
}
/** Exactly one active package per device. A new event cannot silently erase
 * pending inspection work left by the previous event.
 */
export async function createOfflineVault(data:OfflineEventPackage,passphrase:string){
 const encrypted=await sealOfflinePackage(data,passphrase);
 await changeVault(encrypted,null);
 return encrypted.revision;
}
export async function updateOfflineVault(
 data:OfflineEventPackage,passphrase:string,expectedRevision:string,
):Promise<string>{
 const encrypted=await sealOfflinePackage(data,passphrase);
 await changeVault(encrypted,expectedRevision);
 return encrypted.revision;
}
export async function deleteOfflineVault(expectedRevision:string):Promise<void>{
 await changeVault(null,expectedRevision);
}
