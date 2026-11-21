import {judgingResultLink} from './results-operations-model.ts';

export type OperationsSection='registrations'|'inspections'|'results';

export function eventOperationsPath(section:OperationsSection,stageId:string,registrationId?:string):string{
 if(section==='results')return judgingResultLink(stageId,registrationId);
 const query=new URLSearchParams({stageId});
 if(registrationId)query.set(section==='registrations'?'view':'registrationId',registrationId);
 return '/admin/'+section+'?'+query.toString();
}
