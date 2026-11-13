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
