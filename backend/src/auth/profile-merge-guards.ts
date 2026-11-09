import {canonicalPlate} from './duplicate-profile-preview';
import {normalizeHistoricalLinkEmail} from './profile-link-diagnostics';

/** Only two explicitly selected, distinct participants can be combined.
 * Any unknown competing identity is a manual-review blocker, not a best guess.
 */
export type MergeCandidate={
 id:string;firstName:string;lastName:string;middleName:string|null;
 birthDate:Date|null;phone:string|null;photoUrl:string|null;
 city:string|null;team:string|null;legacyId:string|null;usdIdToken:string|null;
 isPublic:boolean;user:{id:string}|null;
 teamMembership:{id:string;teamId:string;status:string}|null;
 legacyEmail:string|null;pendingClaims:number;
 cars:Array<{id:string;registrationCountry:string;registrationNumber:string}>;
 registrations:Array<{id:string;stageId:string;status:string}>;
 stageInspections:Array<{id:string;stageId:string}>;
};
export type MergeBlocker={code:string;description:string};
const normalized=(value:string|null)=>value?.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru')??'';
const name=(person:MergeCandidate)=>[person.lastName,person.firstName,person.middleName].map(normalized).filter(Boolean).join(' ').replace(/ё/g,'е');
const hasDifferent=(a:string|null,b:string|null)=>Boolean(normalized(a)&&normalized(b)&&normalized(a)!==normalized(b));
export function validateMergeCandidates(source:MergeCandidate,target:MergeCandidate):MergeBlocker[]{
 if(source.id===target.id)throw new Error('Нельзя объединять профиль с самим собой');
 const reasons:MergeBlocker[]=[];
 const add=(code:string,description:string)=>reasons.push({code,description});
 if(name(source)!==name(target))
  add('NAME_MISMATCH','Указаны разные ФИО. Необходимо документальное подтверждение личности.');
 if(source.birthDate&&target.birthDate&&source.birthDate.toISOString().slice(0,10)!==target.birthDate.toISOString().slice(0,10))
  add('BIRTH_DATE_MISMATCH','Дата рождения не совпадает.');
 if(source.user&&target.user)
  add('TWO_ACCOUNTS','Оба профиля уже принадлежат разным аккаунтам.');
 if(source.teamMembership&&target.teamMembership)
  add('TWO_MEMBERSHIPS','Два действующих членства нельзя объединить без решения по истории команд.');
 if([source.teamMembership,target.teamMembership].some(row=>row&&row.status!=='APPROVED'))
  add('UNAPPROVED_MEMBERSHIP','Есть незавершённая командная заявка.');
 if(source.pendingClaims>0||target.pendingClaims>0)
  add('PENDING_CLAIM','Ожидается проверка заявки на принадлежность профиля.');
 if(hasDifferent(source.legacyEmail,target.legacyEmail)&&
   normalizeHistoricalLinkEmail(source.legacyEmail!)!==normalizeHistoricalLinkEmail(target.legacyEmail!))
  add('LEGACY_EMAIL_CONFLICT','Разные архивные адреса требуют отдельного подтверждения владельца.');
 if(hasDifferent(source.phone,target.phone))
  add('PHONE_MISMATCH','Контакты профилей различаются. Требуется ручная проверка.');
 if(hasDifferent(source.photoUrl,target.photoUrl))
  add('PHOTO_MISMATCH','Разные фотографии: требуется сохранить обе и выбрать основную.');
 if(hasDifferent(source.city,target.city))
  add('CITY_MISMATCH','У профилей разные города. Требуется ручная проверка.');
 if(hasDifferent(source.team,target.team))
  add('TEAM_LABEL_MISMATCH','У профилей разные архивные обозначения команды.');
 if(source.legacyId&&target.legacyId&&source.legacyId!==target.legacyId)
  add('TWO_LEGACY_IDS','Два архивных ID требуют отдельного разрешения.');
 if(source.usdIdToken&&target.usdIdToken)
  add('TWO_USD_IDS','У профилей два USD ID. Требуется подтверждение и сохранение обоих публичных адресов.');
 if(source.isPublic!==target.isPublic)
  add('PRIVACY_CONFLICT','Видимость профилей различается. Нельзя автоматически раскрывать закрытую историю.');
 const stages=new Set(target.registrations.map(r=>r.stageId));
 if(source.registrations.some(r=>stages.has(r.stageId)))
  add('STAGE_OVERLAP','На одном этапе присутствуют заявки обоих профилей, включая отменённые.');
 const inspected=new Set(target.stageInspections.map(row=>row.stageId));
 if(source.stageInspections.some(row=>inspected.has(row.stageId)))
  add('INSPECTION_OVERLAP','На одном этапе существуют две истории общей инспекции.');
 const targetPlates=new Set(target.cars.map(c=>canonicalPlate(c.registrationCountry,c.registrationNumber)));
 if(source.cars.some(c=>targetPlates.has(canonicalPlate(c.registrationCountry,c.registrationNumber))))
  add('DUPLICATE_CARS','Одинаковый госномер автомобиля в двух профилях.');
 return reasons;
}
