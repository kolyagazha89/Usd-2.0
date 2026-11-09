/** Read-only class comparison; never match different regulations by a similar display name. */
type ClassRow={id:string;name:string;athletes:number};
type DirectionRow={id:string;name:string;classes:readonly ClassRow[]};
export type SeasonClassesInput={directions:readonly DirectionRow[]};
type Entry={classId:string;className:string;directionId:string;direction:string;athletes:number};
export type SeasonClassComparison={
 classId:string;className:string;direction:string;
 baselineName:string|null;baselineAthletes:number|null;currentAthletes:number|null;
 comparable:boolean;difference:number|null;percent:number|null;
};
const flatten=(report:SeasonClassesInput):Entry[]=>report.directions.flatMap(direction=>
 direction.classes.map(cls=>({classId:cls.id,className:cls.name,directionId:direction.id,direction:direction.name,athletes:cls.athletes})));
export function compareSeasonClasses(baseline:SeasonClassesInput,current:SeasonClassesInput):SeasonClassComparison[]{
 const before=new Map(flatten(baseline).map(row=>[row.classId,row]));
 const after=new Map(flatten(current).map(row=>[row.classId,row]));
 const ordered=[...new Set([...after.keys(),...before.keys()])];
 return ordered.map(classId=>{
  const old=before.get(classId),now=after.get(classId);
  // A renamed or moved class might reflect a different regulation. Do not
  // claim its participation is comparable until a verified mapping exists.
  const comparable=Boolean(old&&now&&old.className===now.className&&old.directionId===now.directionId&&old.direction===now.direction);
  const difference=comparable?now!.athletes-old!.athletes:null;
  return {
   classId,className:(now??old)!.className,direction:(now??old)!.direction,
   baselineName:old?.className??null,
   baselineAthletes:old?.athletes??null,currentAthletes:now?.athletes??null,
   comparable,difference,
   percent:comparable&&old!.athletes>0?Math.round(difference!*10000/old!.athletes)/100:null,
  };
 });
}
