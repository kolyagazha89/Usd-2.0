export type RegistrationPassData={
 id:string;stageId?:string;status:string;participantNumber?:number;
 participant?:{firstName?:string;lastName?:string;middleName?:string};
 stage?:{id:string;name?:string;date?:string;city?:string;venue?:string;address?:string};
 car?:{brand?:string;model?:string;registrationNumber?:string};
 numbers?:Array<{id:string;number:number;isPrimary?:boolean}>;
 classes?:Array<{id:string;numberId?:string;number?:{number:number};class?:{name?:string;direction?:{name?:string}}}>;
};
export const titleName=(data:RegistrationPassData)=>[data.participant?.lastName,data.participant?.firstName,data.participant?.middleName].filter(Boolean).join(' ')||'Участник USD';
export const registrationInspectionQrUrl=(origin:string,data:RegistrationPassData)=>
 origin+'/admin/inspections?stageId='+encodeURIComponent(data.stageId||data.stage?.id||'')+'&registrationId='+encodeURIComponent(data.id);
export const registrationNumbers=(data:RegistrationPassData)=>
 [...new Set((data.numbers||[]).map(item=>item.number).filter((value):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>0)
  .concat(typeof data.participantNumber==='number'&&data.participantNumber>0?[data.participantNumber]:[]))].sort((a,b)=>a-b);

