export function userHasProfile(user:any):boolean{return Boolean(user.participantId||user.participant?.id)}
export function filterAdminUsers(users:any[],search:string,role:string,emailStatus:string,profileStatus:string){
 const term=search.trim().toLocaleLowerCase('ru');
 return users.filter(user=>(!term||String(user.email??'').toLocaleLowerCase('ru').includes(term))&&
  (!role||user.role===role)&&
  (emailStatus==='ALL'||Boolean(user.emailVerifiedAt)===(emailStatus==='VERIFIED'))&&
  (profileStatus==='ALL'||userHasProfile(user)===(profileStatus==='LINKED')));
}
