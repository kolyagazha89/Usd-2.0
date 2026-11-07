type TeamPerformanceShape={direction:string;participant:{id:string};place:number|null};
export type TeamStageShape={id:string;date:string;performances:TeamPerformanceShape[]};
export type TeamStageFilter={direction?:string;season?:string;stageId?:string};

/** Filters the already privacy-screened, server-published performances; no unofficial team points. */
export function filterTeamStages<T extends TeamStageShape>(stages:readonly T[],filter:TeamStageFilter):T[]{
 return stages.filter(stage=>(!filter.season||stage.date.slice(0,4)===filter.season)&&(!filter.stageId||stage.id===filter.stageId))
  .map(stage=>({...stage,performances:stage.performances.filter(result=>!filter.direction||result.direction===filter.direction)}))
  .filter(stage=>stage.performances.length>0) as T[];
}
export function teamStageSeasons(stages:readonly TeamStageShape[]):string[]{
 return [...new Set(stages.map(stage=>stage.date.slice(0,4)).filter(year=>year.length===4&&[...year].every(ch=>ch>='0'&&ch<='9')))].sort((a,b)=>b.localeCompare(a));
}
export function summarizeTeamStages(stages:readonly TeamStageShape[]){
 const participants=new Set<string>();let performances=0,podiums=0,firstPlaces=0;
 for(const stage of stages)for(const result of stage.performances){
  performances++;
  participants.add(result.participant.id);
  if(result.place!=null&&Number.isInteger(result.place)&&result.place>=1&&result.place<=3)podiums++;
  if(result.place===1)firstPlaces++;
 }
 return {stages:stages.length,performances,participants:participants.size,podiums,firstPlaces};
}
