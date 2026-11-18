/** USD operational stage day is fixed across devices and browser time zones.
 * Do not compare local Date.setHours(0,0,0,0) for calendar workflows. */
export const USD_STAGE_TIME_ZONE='Asia/Yekaterinburg';

const formatter=new Intl.DateTimeFormat('en-GB',{
 timeZone:USD_STAGE_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',
});

export function stageCalendarDay(value:Date|string|null|undefined):string|null{
 if(!value)return null;
 const date=value instanceof Date?value:new Date(value);
 if(!Number.isFinite(date.getTime()))return null;
 const parts=Object.fromEntries(formatter.formatToParts(date).map(part=>[part.type,part.value]));
 if(!parts.year||!parts.month||!parts.day)return null;
 return parts.year+'-'+parts.month+'-'+parts.day;
}

export type CalendarStage={id:string;date?:string|null;status?:string|null};

export function isPastStageCalendar(stage:Pick<CalendarStage,'date'|'status'>|null|undefined,now=new Date()):boolean{
 if(!stage)return false;
 if(stage.status==='COMPLETED'||stage.status==='CANCELLED')return true;
 const stageDay=stageCalendarDay(stage.date),today=stageCalendarDay(now);
 return Boolean(stageDay&&today&&stageDay<today);
}

/** A stage happening today must remain selectable after local midnight. */
export function chooseInitialStage(stages:readonly CalendarStage[],now=new Date()):string{
 const today=stageCalendarDay(now);
 const sorted=[...stages].filter(stage=>stage.status!=='CANCELLED')
  .sort((a,b)=>{
   const first=Date.parse(a.date??''),second=Date.parse(b.date??'');
   return (Number.isFinite(first)?first:Number.POSITIVE_INFINITY)
    -(Number.isFinite(second)?second:Number.POSITIVE_INFINITY);
  });
 return sorted.find(stage=>{
  const day=stageCalendarDay(stage.date);
  return Boolean(day&&today&&day>=today);
 })?.id??sorted.at(-1)?.id??stages[0]?.id??'';
}
