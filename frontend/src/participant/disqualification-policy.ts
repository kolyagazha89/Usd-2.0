/** The API returns only active decisions for the authenticated profile. */
export type ActiveDisqualification={
 id:string;scope:'STAGE'|'SEASON'|'FORMAT';
 stageId?:string|null;seasonId?:string|null;reason?:string|null;
 status?:'ACTIVE'|'REVOKED';createdAt?:string;
};
export type DisqualificationStage={id:string;seasonId?:string|null};

/** Broader bans take priority; unrelated stage/season decisions never block an event. */
export function blockingDisqualification(items:readonly ActiveDisqualification[],stage:DisqualificationStage|null|undefined):ActiveDisqualification|null{
 if(!stage)return null;
 const active=items.filter(item=>item.status!=='REVOKED');
 return active.find(item=>item.scope==='FORMAT')
  ??active.find(item=>item.scope==='SEASON'&&Boolean(stage.seasonId)&&item.seasonId===stage.seasonId)
  ??active.find(item=>item.scope==='STAGE'&&item.stageId===stage.id)
  ??null;
}
export function disqualificationScopeLabel(item:ActiveDisqualification):string{
 if(item.scope==='FORMAT')return 'Весь формат соревнований USD';
 if(item.scope==='SEASON')return 'Сезон';
 return 'Отдельный этап';
}
export function disqualificationBlockMessage(item:ActiveDisqualification):string{
 const scope=item.scope==='FORMAT'?'на всех этапах USD':item.scope==='SEASON'?'в этом сезоне':'на этом этапе';
 return 'Действует дисквалификация: регистрация запрещена '+scope+'.';
}
