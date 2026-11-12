export function tokenHash(token:string):string;
export function derivedPassphrase(token:string):string;
export function checkAuthority(grant:unknown,token:string,pem:string,stageId:string,now?:number):{fingerprint:string;baselineSha256:string};
