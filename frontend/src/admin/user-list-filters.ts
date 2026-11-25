export function userHasProfile(user:any):boolean{return Boolean(user.participantId||user.participant?.id)}
export function filterAdminUsers(users:any[],search:string,role:string,emailStatus:string,profileStatus:string){
 const normalize=(value:string)=>value.toLocaleLowerCase('ru').replace(/ё/g,'е');
 const terms=normalize(search).trim().split(/\s+/).filter(Boolean);
 return users.filter(user=>terms.every(term=>normalize([user.email,user.participant?.lastName,user.participant?.firstName,user.participant?.middleName].filter(Boolean).join(' ')).includes(term))&&
  (!role||user.role===role)&&
  (emailStatus==='ALL'||Boolean(user.emailVerifiedAt)===(emailStatus==='VERIFIED'))&&
  (profileStatus==='ALL'||userHasProfile(user)===(profileStatus==='LINKED')));
}
