/**
 * Team comparison is a read-only rollup of individually published protocols.
 * It deliberately does NOT convert DB/MPS into common points, award team
 * places, or infer historical membership from today's roster.
 */
export type PublishedTeamResultRow = {
 id:string;place:number|null;unit:string;value:{toString():string};
 registration:{
  teamIdAtInspection:string|null;teamNameAtInspection:string|null;
  participant:{id:string;firstName:string;lastName:string};
  stage:{id:string;name:string;city:string|null;date:Date;seasonId:string};
 };
 registrationClass:{class:{id:string;name:string;direction:{name:string}}};
};

export function groupPublishedTeamPerformances(
 rows:readonly PublishedTeamResultRow[],
 teamNames:ReadonlyMap<string,string>,
){
 type TeamResult={id:string;participant:{id:string;firstName:string;lastName:string};
  stage:{id:string;name:string;date:Date;seasonId:string};
  direction:string;classId:string;className:string;value:string;unit:string;place:number|null};
 type TeamSummary={teamId:string;name:string;performances:number;firstPlaces:number;podiums:number;
  participants:number;results:TeamResult[];_athletes:Set<string>};
 const grouped=new Map<string,TeamSummary>();
 for(const row of rows){
  const teamId=row.registration.teamIdAtInspection?.trim();
  if(!teamId)continue; // old records with no frozen affiliation stay unattributed
  let group=grouped.get(teamId);
  if(!group){
   group={teamId,name:teamNames.get(teamId)||row.registration.teamNameAtInspection?.trim()||'Команда USD',
    performances:0,firstPlaces:0,podiums:0,participants:0,results:[],_athletes:new Set()};
   grouped.set(teamId,group);
  }
  const {participant,stage}=row.registration;
  group._athletes.add(participant.id);
  group.performances++;
  if(row.place===1)group.firstPlaces++;
  if(row.place!=null&&row.place>=1&&row.place<=3)group.podiums++;
  group.results.push({
   id:row.id,participant,
   stage:{id:stage.id,name:stage.name,date:stage.date,seasonId:stage.seasonId},
   direction:row.registrationClass.class.direction.name,
   classId:row.registrationClass.class.id,
   className:row.registrationClass.class.name,
   value:row.value.toString(),unit:row.unit,place:row.place,
  });
 }
 return [...grouped.values()].map(({_athletes,...group})=>({...group,participants:_athletes.size}))
  .sort((a,b)=>b.firstPlaces-a.firstPlaces||b.podiums-a.podiums||
   b.performances-a.performances||a.name.localeCompare(b.name,'ru'));
}
