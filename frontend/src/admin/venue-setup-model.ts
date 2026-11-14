export type VenueSetup={
 signing:{ready:boolean;publicKeyPem:string|null;fingerprint:string|null};
 centralSyncReady:boolean;fieldAcceptanceComplete:boolean;
};
/** Obtain the trust anchor from the authenticated server, never the stage file. */
export function trustedVenueKey(setup:VenueSetup){
 const {ready,publicKeyPem,fingerprint}=setup.signing;
 if(!ready||typeof publicKeyPem!=='string'||!publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----')
  ||typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(fingerprint))
  throw new Error('Сервер ещё не настроен для настоящего этапа. Тестовый запуск доступен.');
 return {publicKeyPem,fingerprint};
}
export function validateVenueDownload(value:unknown,stageId:string,setup:VenueSetup,now=Date.now()){
 const key=trustedVenueKey(setup);
 const data=value as {snapshot?:{stageId?:string;generatedAt?:string;expiresAt?:string;syncAuthorization?:{token?:string;expiresAt?:string}};
  integrity?:{algorithm?:string;signature?:string;sha256?:string;publicKeyFingerprint?:string}}|null;
 const created=Date.parse(data?.snapshot?.generatedAt??''),expires=Date.parse(data?.snapshot?.expiresAt??'');
 if(data?.snapshot?.stageId!==stageId||data?.integrity?.algorithm!=='Ed25519'
  ||typeof data.integrity.signature!=='string'||!/^[A-Za-z0-9_-]{64,180}$/.test(data.integrity.signature)
  ||typeof data.integrity.sha256!=='string'||!/^[a-f0-9]{64}$/.test(data.integrity.sha256)
  ||data.integrity.publicKeyFingerprint!==key.fingerprint
  ||!Number.isFinite(created)||!Number.isFinite(expires)||expires<=now||created>now+300000
  ||expires<=created||expires-created>72*60*60*1000
  ||!/^[A-Za-z0-9_-]{43}$/.test(data.snapshot?.syncAuthorization?.token??'')
  ||Date.parse(data.snapshot?.syncAuthorization?.expiresAt??'')<=now)
  throw new Error('Пакет не прошёл проверку этапа, ключа или срока действия. Обновите страницу и повторите скачивание.');
 return {expiresAt:new Date(expires).toLocaleString('ru-RU'),text:JSON.stringify(value)};
}
export function saveVenueFile(filename:string,content:string,type:string){
 const url=URL.createObjectURL(new Blob([content],{type}));
 const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);
 try{link.click()}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000)}
}

/** The ADMIN-only export deliberately keeps the AES unlock key outside
 * the signed stage JSON; both are required to activate existing USD staff.
 */
export function validateVenueStaffExport(value:unknown,stageId:string,setup:VenueSetup,now=Date.now()){
 const body=value as {signed?:unknown;staffKey?:unknown;staffCount?:unknown}|null;
 const signed=body?.signed as {snapshot?:{staffAccess?:{
  format?:unknown;algorithm?:unknown;nonce?:unknown;tag?:unknown;ciphertext?:unknown;
 }}}|undefined;
 const sealed=signed?.snapshot?.staffAccess;
 if(typeof body?.staffKey!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.staffKey)
  ||typeof body.staffCount!=='number'||!Number.isSafeInteger(body.staffCount)
  ||body.staffCount<1||body.staffCount>40
  ||sealed?.format!==1||sealed.algorithm!=='AES-256-GCM'
  ||typeof sealed.nonce!=='string'||!/^[A-Za-z0-9_-]{16}$/.test(sealed.nonce)
  ||typeof sealed.tag!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(sealed.tag)
  ||typeof sealed.ciphertext!=='string'||!/^[A-Za-z0-9_-]{10,130000}$/.test(sealed.ciphertext))
  throw new Error('Защищённый пакет судей или отдельный ключ не прошёл проверку');
 const file=validateVenueDownload(body.signed,stageId,setup,now);
 if(file.text.includes(body.staffKey))
  throw new Error('Ключ судей не должен храниться внутри пакета этапа');
 return {...file,staffKey:body.staffKey,staffCount:body.staffCount};
}
