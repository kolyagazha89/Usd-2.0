import type {User} from '../api';

/** Operational access is independent from the participant account. */
export function hasAdminPanelAccess(user:User|null|undefined):boolean{
 if(!user)return false;
 if(user.role==='ADMIN')return true;
 if(!user.customRoleId)return false;
 return Object.values(user.customRole?.permissions??{}).some(
  actions=>Array.isArray(actions)&&(actions.includes('view')||actions.includes('*')),
 );
}

export function accountLanding(user:User,requested:string|null,enteredAdmin=false):string{
 const safe=requested?.startsWith('/')&&!requested.startsWith('//')&&!requested.includes('\\')?requested:null;
 if(safe&&/^\/participant(?:\/|\?|$)/.test(safe))return safe;
 if(safe&&/^\/admin(?:\/|\?|$)/.test(safe)&&hasAdminPanelAccess(user))return safe;
 return (enteredAdmin||user.role==='ADMIN')&&hasAdminPanelAccess(user)?'/admin':'/participant';
}
