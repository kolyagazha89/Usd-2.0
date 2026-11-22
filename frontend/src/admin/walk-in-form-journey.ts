/** Progress for a walk-in registration without interpreting BassRace extra numbers as a sixth primary class. */
export type WalkInFormState={
 participantId:string;carId:string;classIds:readonly string[];primaryClassCount:number;
 legalReady:boolean;privacyConsent:boolean;termsAccepted:boolean;rulesAccepted:boolean;protocolConsent:boolean;
};
export function walkInStepProgress(state:WalkInFormState):[boolean,boolean,boolean]{
 return [
  Boolean(state.participantId.trim()&&state.carId.trim()),
  state.classIds.length>0&&state.classIds.length<=100&&state.primaryClassCount<=5,
  state.legalReady&&state.privacyConsent&&state.termsAccepted&&state.rulesAccepted&&state.protocolConsent,
 ];
}
export function walkInNextStep(current:number,ready:readonly boolean[]):0|1|2{
 const step=Math.max(0,Math.min(2,Math.trunc(current)));
 return (step<2&&ready[step]?step+1:step) as 0|1|2;
}


type WalkInConfiguration={name:string;versions?:{id:string;version:number;additionalDescription?:string|null}[]};

export function walkInConfigurationOptions(configurations:readonly WalkInConfiguration[]){
 return configurations.flatMap(configuration=>(configuration.versions??[])
  .filter(version=>version.additionalDescription!=='USD_ON_SITE_DRAFT_PENDING')
  .map(version=>({id:version.id,label:configuration.name+' · v'+version.version})));
}
