import {isPendingEquipment} from './event-ops-model.ts';
import {judgingInspectionStatus,judgingNumbers,matchesJudgeSearch} from './results-operations-model.ts';
import type {User} from '../api.ts';

export type DayStatus='ALL'|'PASSED'|'PENDING'|'FAILED'|'CANCELLED'|'EQUIPMENT';
export type DayRow={
 id:string;status?:string;participantId?:string|null;carId?:string|null;participantNumber?:number|null;
 numbers?:Array<{number?:number|null}>;classes?:Array<{id?:string;number?:{number?:number|null};class?:{name?:string;direction?:{name?:string}}}>;
 participant?:{firstName?:string|null;lastName?:string|null;middleName?:string|null;team?:string|{name?:string}}|null;
 car?:{id?:string|null;brand?:string;model?:string;registrationNumber?:string}|null;
 inspection?:{id?:string;status?:string;checkedByUserId?:string|null;createdByUserId?:string|null;notes?:string|null}|null;
 stageInspection?:{id?:string;status?:string;checkedByUserId?:string|null;createdByUserId?:string|null;notes?:string|null}|null;
 configurationSnapshot?:{configurationPending?:boolean;postStageCompletion?:{versionId?:string|null}|null}|null;
};

export function dayStatus(row:DayRow):'PASSED'|'PENDING'|'FAILED'|'CANCELLED' {
 if(row.status!=='ACTIVE')return 'CANCELLED';
 return judgingInspectionStatus(row);
}
export function eventDayCounts(rows:readonly DayRow[]){
 const active=rows.filter(r=>r.status==='ACTIVE');
 const passed=active.filter(r=>dayStatus(r)==='PASSED');
 return {
  total:rows.length,active:active.length,passed:passed.length,
  pending:active.filter(r=>dayStatus(r)==='PENDING').length,
  failed:active.filter(r=>dayStatus(r)==='FAILED').length,
  cancelled:rows.filter(r=>r.status==='CANCELLED').length,
  equipment:active.filter(isPendingEquipment).length,
  people:new Set(active.map(r=>r.participantId).filter(Boolean)).size,
 };
}
function firstNumber(row:DayRow):number{
 return judgingNumbers(row)[0]??Number.POSITIVE_INFINITY;
}
export function filterEventDayRows(rows:readonly DayRow[],search:string,status:DayStatus):DayRow[]{
 return rows.filter(row=>(
  status==='ALL'?row.status==='ACTIVE':
  status==='EQUIPMENT'?isPendingEquipment(row):
  status==='CANCELLED'?row.status==='CANCELLED':
  dayStatus(row)===status
 )&&matchesJudgeSearch(row,search))
 .sort((a,b)=>firstNumber(a)-firstNumber(b)
  ||String(a.participant?.lastName??'').localeCompare(String(b.participant?.lastName??''),'ru')
  ||a.id.localeCompare(b.id));
}
export function stageIsReadOnly(stage:{date?:string|null;status?:string|null}|undefined,now=new Date()):boolean{
 if(!stage)return true;
 if(stage.status==='COMPLETED'||stage.status==='CANCELLED')return true;
 if(!stage.date)return false;
 const date=new Date(stage.date);
 if(!Number.isFinite(date.getTime()))return false;
 const today=new Date(now);
 date.setHours(0,0,0,0);today.setHours(0,0,0,0);
 return date.getTime()<today.getTime();
}
export function hasDayPermission(user:User,module:string,action:'view'|'create'|'update'):boolean{
 if(user.role==='ADMIN')return true;
 const perms=user.customRole?.permissions?.[module]??[];
 return Boolean(user.customRoleId&&Array.isArray(perms)&&(perms.includes(action)||perms.includes('*')));
}
export function canChangeDayInspection(user:User,row:DayRow,readOnly:boolean):boolean {
 if(readOnly||row.status!=='ACTIVE'||!hasDayPermission(user,'inspections','view'))return false;
 const inspected=row.stageInspection??row.inspection;
 if(!inspected?.id)return hasDayPermission(user,'inspections','create');
 if(!hasDayPermission(user,'inspections','update'))return false;
 return user.role==='ADMIN'||inspected.checkedByUserId===user.id||inspected.createdByUserId===user.id;
}
export const dayPath=(path:'/admin/event-day'|'/admin/inspections'|'/admin/registrations'|'/admin/results',stageId:string,registrationId?:string)=>{
 const params=new URLSearchParams({stageId});
 if(registrationId)params.set('registrationId',registrationId);
 return path+'?'+params.toString();
};
