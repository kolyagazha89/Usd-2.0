/** Read-only, lossless planning data for historical participant deduplication.
 * No client may interpret a clean preview as authorization to merge.
 */
export type DuplicateSnapshot = {
 id:string;name:string;birthDate:string|null;
 profilePhoto?:boolean;mediaUploads?:number;
 linkedUserId:string|null;legacyId:string|null;usdIdExists:boolean;
 teamId:string|null;
 cars:Array<{id:string;country:string;number:string;configurations:number;configurationVersions?:number;hasPhoto?:boolean}>;
 registrations:Array<{id:string;stageId:string;status:string;classes:number;results:number;numbers:number;historicalTeamSnapshot?:boolean}>;
 stageInspections:number;disqualifications:number;records:number;claims:number;
};
export type DuplicateFinding={code:string;description:string};
const looksAlike:Record<string,string>={A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',P:'Р',C:'С',T:'Т',Y:'У',X:'Х'};
export function canonicalPlate(country:string,plate:string):string {
 const letters=plate.toLocaleUpperCase('ru').replace(/[^0-9A-ZА-ЯЁ]/g,'');
 return country+':'+(country==='RU'?[...letters].map(c=>looksAlike[c]??c).join(''):letters);
}
export function duplicatePreview(source:DuplicateSnapshot,target:DuplicateSnapshot){
 if(source.id===target.id)throw new Error('Невозможно объединить профиль с самим собой');
 const findings:DuplicateFinding[]=[];
 const add=(code:string,description:string)=>findings.push({code,description});
 if(source.linkedUserId&&target.linkedUserId)
  add('TWO_ACCOUNTS','Оба профиля привязаны к аккаунтам. Требуется разрешение конфликта двух владельцев.');
 if(source.birthDate&&target.birthDate&&source.birthDate!==target.birthDate)
  add('BIRTH_DATE_MISMATCH','Даты рождения не совпадают. Требуется независимая проверка личности.');
 if(source.teamId&&target.teamId&&source.teamId!==target.teamId)
  add('DIFFERENT_TEAMS','Профили состоят в разных командах. Сохраните историю членства перед объединением.');
 if(source.usdIdExists&&target.usdIdExists)
  add('TWO_USD_IDS','У обоих профилей есть действующие USD ID. Необходим безопасный механизм переадресации.');
 if(source.legacyId&&target.legacyId&&source.legacyId!==target.legacyId)
  add('TWO_LEGACY_IDS','Оба профиля содержат разные архивные идентификаторы. Нельзя терять соответствие архива.');
 const stages=new Set(target.registrations.filter(r=>r.status==='ACTIVE').map(r=>r.stageId));
 const sameStages=[...new Set(source.registrations.filter(r=>r.status==='ACTIVE'&&stages.has(r.stageId)).map(r=>r.stageId))];
 if(sameStages.length)add('SAME_STAGE','Оба участника имеют активные заявки на одних и тех же этапах ('+sameStages.length+'). Проверьте номера, результаты и классы.');
 // Cancelled registrations may still retain verified results and immutable configuration snapshots.
 const archivedOverlaps=[...new Set(source.registrations.filter(r=>
  target.registrations.some(t=>t.stageId===r.stageId &&
   (r.status!=='ACTIVE'||t.status!=='ACTIVE') &&
   (r.results>0||t.results>0))).map(r=>r.stageId))];
 if(archivedOverlaps.length)add('HISTORICAL_STAGE_OVERLAP',
  'Есть общие этапы с отменёнными/архивными регистрациями и результатами ('+archivedOverlaps.length+'). Требуется ручной разбор истории.');
 const targetPlates=new Set(target.cars.map(c=>canonicalPlate(c.country,c.number)));
 const repeatPlates=source.cars.filter(c=>targetPlates.has(canonicalPlate(c.country,c.number)));
 if(repeatPlates.length)add('DUPLICATE_CARS','Обнаружены одинаковые госномера с учётом латиницы и кириллицы ('+repeatPlates.length+'). Требуется проверка конфигураций и снимков.');
 const totals=(p:DuplicateSnapshot)=>({
  cars:p.cars.length,configurations:p.cars.reduce((sum,c)=>sum+c.configurations,0),
  configurationVersions:p.cars.reduce((sum,c)=>sum+(c.configurationVersions??0),0),
  profilePhotos:p.profilePhoto?1:0,carPhotos:p.cars.filter(c=>c.hasPhoto).length,
  mediaUploads:p.mediaUploads??0,teamSnapshots:p.registrations.filter(r=>r.historicalTeamSnapshot).length,
  registrations:p.registrations.length,classes:p.registrations.reduce((n,r)=>n+r.classes,0),
  results:p.registrations.reduce((n,r)=>n+r.results,0),
  registrationNumbers:p.registrations.reduce((n,r)=>n+r.numbers,0),
  inspections:p.stageInspections,records:p.records,
  disqualifications:p.disqualifications,pendingClaims:p.claims,
 });
 return {state:'DRY_RUN_ONLY' as const,canMerge:false,source,target,
  counts:{source:totals(source),target:totals(target)},
  conflicts:findings,
  constraints:[
   'Это предварительный анализ. Никакие профили, регистрации, результаты, номера, снимки оборудования или USD ID не изменены.',
   'Объединение запрещено до реализации атомарного переноса с историческими ID/redirect, сохранением результатов и повторной проверкой конфликтов в транзакции.',
   'В схеме нет отдельной модели платежей: нулевые счётчики не подтверждают отсутствие внешних платёжных обязательств.',
  ],
 };
}
