/** USD LAN return bundle v1: local only, no implicit central sync.
 *
 * Two independent trust boundaries:
 *  - AES-256-GCM + scrypt: encrypts PII for physical transfer.
 *  - Ed25519 signature + independently pinned public-key fingerprint:
 *    authenticates the particular physical venue's exported journal.
 *
 * Central application MUST check current stage/baseline and conflicts
 * before applying any return event. This module makes NO database writes.
 */
import {
 createHash,createPrivateKey,createPublicKey,randomBytes,sign,verify,
 createCipheriv,createDecipheriv,scryptSync,
} from 'node:crypto';

const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const B64=/^[A-Za-z0-9_-]+$/;
const MAX_EVENTS=25000;
const MAX_BYTES=30*1024*1024;
const TTL=90*24*60*60*1000;
const PURPOSE='USD_VENUE_RETURN_OPERATIONS';
const CIPHER_PURPOSE='USD_VENUE_RETURN_ENCRYPTED';
const allowed=new Set([
 'Stage','Participant','Car','CarConfiguration','CarConfigurationVersion',
 'CarAmplifier','CarAudioComponent','CarBattery','CarGenerator','CarHeadUnit',
 'CarAmplifierComponent',
 'Registration','RegistrationNumber','RegistrationClass',
 'Inspection','ParticipantStageInspection','RegistrationClassInspection',
 'Result','Disqualification',
]);
export const FULL_RETURN_COVERAGE_TABLES=Object.freeze([...allowed].sort());
const hash=buf=>createHash('sha256').update(buf).digest('hex');
const exactly=(value,fields,context)=>{
 if(value===null||typeof value!=='object'||Array.isArray(value)
  ||Object.keys(value).length!==fields.length
  ||fields.some(field=>!Object.hasOwn(value,field)))
  throw new Error('Некорректный набор полей: '+context);
};
const dateMs=(value,context)=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value))
  throw new Error('Некорректная дата: '+context);
 const ms=Date.parse(value);
 if(!Number.isFinite(ms))throw new Error('Некорректная дата: '+context);
 return ms;
};
function validateEvents(events,stageId){
 if(!Array.isArray(events)||events.length>MAX_EVENTS)
  throw new Error('Превышен лимит операций площадки');
 let previous='0'.repeat(64),sequence=0;
 for(const [index,item] of events.entries()){
  exactly(item,['sequence','previousHash','hash','payload'],'операция '+index);
  if(!Number.isSafeInteger(item.sequence)||item.sequence<=sequence
    ||!SHA.test(item.hash)||!SHA.test(item.previousHash)
    ||item.previousHash!==previous)
   throw new Error('Нарушена цепочка SHA-256 журнала площадки');
  exactly(item.payload,[
   'sequence','stageId','table','recordId','operation','before','after','recordedAt',
  ],'поля записи журнала');
  const p=item.payload;
  if(p.sequence!==item.sequence||p.stageId!==stageId)
   throw new Error('Операция относится к другому этапу');
  if(!allowed.has(p.table))throw new Error('Запрещённая таблица в журнале площадки');
  if(!UUID.test(p.recordId)||!['INSERT','UPDATE','DELETE'].includes(p.operation))
   throw new Error('Некорректный идентификатор или тип операции');
  if((p.before!==null&&(typeof p.before!=='object'||Array.isArray(p.before)))
   ||(p.after!==null&&(typeof p.after!=='object'||Array.isArray(p.after))))
   throw new Error('Некорректное состояние операции');
  if((p.operation==='INSERT'&&p.before!==null)
   ||(p.operation==='DELETE'&&p.after!==null)
   ||(p.operation==='UPDATE'&&(p.before===null||p.after===null))
   ||(p.operation==='INSERT'&&p.after===null)
   ||(p.operation==='DELETE'&&p.before===null))
   throw new Error('Неверная структура INSERT/UPDATE/DELETE');
  dateMs(p.recordedAt,'время операции');
  previous=item.hash;sequence=item.sequence;
 }
 return previous;
}
function validateSnapshot(snapshot,now=Date.now()){
 exactly(snapshot,[
  'format','purpose','stageId','baselineSha256','generatedAt','expiresAt',
  'eventCount','journalEndHash','events',
  ...(snapshot.format===2?['journalCoverage']:[]),
 ],'снимок операций');
 if(![1,2].includes(snapshot.format)||snapshot.purpose!==PURPOSE
  ||!UUID.test(snapshot.stageId)||!SHA.test(snapshot.baselineSha256)
  ||!SHA.test(snapshot.journalEndHash))
  throw new Error('Неверный формат возвратного пакета');
 if(snapshot.format===2){
  exactly(snapshot.journalCoverage,['fromSequence','tables'],'охват журнала');
  if(snapshot.journalCoverage.fromSequence!==0
   ||!Array.isArray(snapshot.journalCoverage.tables)
   ||JSON.stringify(snapshot.journalCoverage.tables)!==JSON.stringify(FULL_RETURN_COVERAGE_TABLES))
   throw new Error('Неполное покрытие журнала площадки: полный возврат запрещён');
 }
 const created=dateMs(snapshot.generatedAt,'создание пакета');
 const expires=dateMs(snapshot.expiresAt,'срок возвратного пакета');
 if(expires<=created||expires-created>TTL
  ||now>expires||now<created-5*60*1000)
  throw new Error('Истёк срок возвратного пакета или неверно время');
 const end=validateEvents(snapshot.events,snapshot.stageId);
 if(snapshot.eventCount!==snapshot.events.length||end!==snapshot.journalEndHash)
  throw new Error('Неверный размер или конец цепочки журнала');
 if(Buffer.byteLength(JSON.stringify(snapshot))>MAX_BYTES)
  throw new Error('Слишком большой возвратный пакет');
 return snapshot;
}
export function makeVenueReturnSnapshot({stageId,baselineSha256,events,
 generatedAt=new Date().toISOString(),journalCoverage}){
 const end=validateEvents(events,stageId);
 const start=dateMs(generatedAt,'создание возвратного пакета');
 return validateSnapshot({
  format:journalCoverage===undefined?1:2,purpose:PURPOSE,stageId,baselineSha256,generatedAt,
  ...(journalCoverage===undefined?{}:{journalCoverage}),
  expiresAt:new Date(start+TTL).toISOString(),
  eventCount:events.length,journalEndHash:end,events,
 },start);
}
export function signVenueReturnSnapshot(snapshot,privatePem){
 validateSnapshot(snapshot,Date.parse(snapshot.generatedAt));
 const key=createPrivateKey(privatePem);
 if(key.asymmetricKeyType!=='ed25519')throw new Error('Нужен закрытый Ed25519 ключ площадки');
 const publicKey=createPublicKey(key);
 const bytes=Buffer.from(JSON.stringify(snapshot));
 return {
  snapshot,
  integrity:{
   algorithm:'Ed25519',sha256:hash(bytes),
   publicKeyFingerprint:hash(publicKey.export({type:'spki',format:'der'})),
   signature:sign(null,bytes,key).toString('base64url'),
  },
 };
}
function passphraseKey(passphrase,salt){
 if(typeof passphrase!=='string'||passphrase.length<16||passphrase.length>128
  ||!/[a-z]/.test(passphrase)||!/[A-Z]/.test(passphrase)
  ||!/[0-9]/.test(passphrase)||!/[^a-zA-Z0-9]/.test(passphrase))
  throw new Error('Нужна сильная отдельная фраза шифрования (от 16 символов)');
 return scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
}
export function encryptVenueReturn(signed,passphrase){
 exactly(signed,['snapshot','integrity'],'подписанный пакет');
 const payload=Buffer.from(JSON.stringify(signed));
 if(payload.length>MAX_BYTES+4096)throw new Error('Превышен максимальный размер файла');
 const salt=randomBytes(16),nonce=randomBytes(12);
 const key=passphraseKey(passphrase,salt);
 const cipher=createCipheriv('aes-256-gcm',key,nonce);
 cipher.setAAD(Buffer.from(CIPHER_PURPOSE));
 const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);
 return {
  format:1,purpose:CIPHER_PURPOSE,
  encryption:{
   algorithm:'AES-256-GCM',kdf:'scrypt',
   salt:salt.toString('base64url'),
   nonce:nonce.toString('base64url'),
   tag:cipher.getAuthTag().toString('base64url'),
  },
  ciphertext:ciphertext.toString('base64url'),
 };
}
function decode(value,expectedSize,context){
 if(typeof value!=='string'||!B64.test(value))throw new Error('Неверный '+context);
 const buf=Buffer.from(value,'base64url');
 if(expectedSize!==null&&buf.length!==expectedSize)throw new Error('Неверный '+context);
 return buf;
}
/** Explicit central trust parameters are REQUIRED; no key is trusted merely
 * because the package says it was used for signing.
 */
export function openVenueReturn(envelope,passphrase,trustedPublicPem,options){
 exactly(envelope,['format','purpose','encryption','ciphertext'],'внешний контейнер');
 if(envelope.format!==1||envelope.purpose!==CIPHER_PURPOSE
  ||typeof envelope.ciphertext!=='string'
  ||envelope.ciphertext.length>Math.ceil((MAX_BYTES+4096)*4/3)+100)
  throw new Error('Неверный формат защищённого файла');
 exactly(envelope.encryption,['algorithm','kdf','salt','nonce','tag'],'шифрование');
 if(envelope.encryption.algorithm!=='AES-256-GCM'||envelope.encryption.kdf!=='scrypt')
  throw new Error('Неверный алгоритм шифрования');
 const salt=decode(envelope.encryption.salt,16,'salt');
 const nonce=decode(envelope.encryption.nonce,12,'nonce');
 const tag=decode(envelope.encryption.tag,16,'tag');
 const ciphertext=decode(envelope.ciphertext,null,'ciphertext');
 const key=passphraseKey(passphrase,salt);
 let signed;
 try{
  const decipher=createDecipheriv('aes-256-gcm',key,nonce);
  decipher.setAAD(Buffer.from(CIPHER_PURPOSE));
  decipher.setAuthTag(tag);
  signed=JSON.parse(Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8'));
 }catch{throw new Error('Неверный пароль или повреждён шифрованный пакет')}
 exactly(signed,['snapshot','integrity'],'подписанные операции');
 exactly(signed.integrity,['algorithm','sha256','publicKeyFingerprint','signature'],'цифровая подпись');
 const {snapshot,integrity}=signed;
 if(integrity.algorithm!=='Ed25519'
  ||!SHA.test(integrity.sha256)
  ||!SHA.test(integrity.publicKeyFingerprint)
  ||typeof integrity.signature!=='string')
  throw new Error('Не подтверждена цифровая подпись');
 const keyObject=createPublicKey(trustedPublicPem);
 if(keyObject.asymmetricKeyType!=='ed25519')
  throw new Error('Неверный доверенный открытый ключ');
 const pinned=hash(keyObject.export({type:'spki',format:'der'}));
 if(!options||!SHA.test(options.trustedFingerprint)
  ||options.trustedFingerprint!==pinned
  ||integrity.publicKeyFingerprint!==pinned)
  throw new Error('Не совпадает доверенный отпечаток подписи площадки');
 const bytes=Buffer.from(JSON.stringify(snapshot));
 if(bytes.length>MAX_BYTES||hash(bytes)!==integrity.sha256
  ||!verify(null,bytes,keyObject,decode(integrity.signature,null,'подпись')))
  throw new Error('Не подтверждена цифровая подпись возвратного пакета');
 const valid=validateSnapshot(snapshot,options.now??Date.now());
 if(valid.stageId!==options.stageId||valid.baselineSha256!==options.baselineSha256)
  throw new Error('Пакет принадлежит другому этапу или исходному снимку');
 return valid;
}
