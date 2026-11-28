/** Presentation only: audit history is not rewritten or inferred from current records. */
type Row=Record<string,any>;
type Field={key:string;label:string;value:string};
type Change={key:string;label:string;before:string;after:string};
const entities:Record<string,string>={
 User:'Пользователь',Role:'Роль',Participant:'Участник',Car:'Автомобиль',CarConfiguration:'Конфигурация автомобиля',CarConfigurationVersion:'Версия конфигурации',Season:'Сезон',Stage:'Этап',StageClass:'Класс этапа',Direction:'Направление',Class:'Класс',Registration:'Регистрация',RegistrationClass:'Заявка на класс',RegistrationNumber:'Номер участника',Inspection:'Инспекция автомобиля',ParticipantStageInspection:'Инспекция участника на этапе',RegistrationClassInspection:'Инспекция класса',Result:'Результат',Record:'Рекорд',Disqualification:'Дисквалификация',ImportJob:'Импорт',ImportRow:'Строка импорта',MediaUpload:'Медиафайл',AssistantRequest:'Запрос ассистента',SiteSettings:'Настройки сайта',Team:'Команда',TeamPost:'Публикация команды',ProfileLinkRequest:'Привязка профиля',OfflineInspectionOperation:'Офлайн-инспекция',VenueReturn:'Возврат офлайн-этапа',PublicSite:'Публичный сайт',ComponentCatalogRequest:'Запрос в справочник',PushMessage:'Уведомление',PushSubscription:'Подписка на уведомления',
};
const actions:Record<string,string>={
 CREATE:'Создание',UPDATE:'Изменение',DELETE:'Удаление',LOGIN:'Вход в систему',LOGOUT:'Выход из системы',RESULT_CREATED:'Результат внесён',RESULT_UPDATED:'Результат изменён',RESULT_CORRECTED:'Результат исправлен',RESULT_DELETED:'Результат удалён',REGISTRATION_CREATED:'Регистрация создана',REGISTRATION_CANCELLED:'Регистрация отменена',REGISTRATION_UPDATED:'Регистрация изменена',REGISTRATION_CLASSES_CHANGED:'Классы регистрации изменены',INSPECTION_CREATED:'Инспекция проведена',INSPECTION_UPDATED:'Инспекция изменена',INSPECTION_DELETED:'Инспекция удалена',VEHICLE_INSPECTION_CREATED:'Инспекция автомобиля проведена',VEHICLE_INSPECTION_UPDATED:'Инспекция автомобиля изменена',VEHICLE_INSPECTION_DELETED:'Инспекция автомобиля удалена',PARTICIPANT_STAGE_INSPECTION_CREATED:'Инспекция участника проведена',PARTICIPANT_STAGE_INSPECTION_UPDATED:'Инспекция участника изменена',PARTICIPANT_STAGE_INSPECTION_DELETED:'Инспекция участника удалена',BASSRACE_CLASS_INSPECTION_CREATED:'Инспекция BassRace проведена',BASSRACE_CLASS_INSPECTION_UPDATED:'Инспекция BassRace изменена',BASSRACE_CLASS_INSPECTION_DELETED:'Инспекция BassRace удалена',ON_SITE_PROFILE_CREATED:'Создан профиль участника на площадке',ON_SITE_CAR_CREATED:'Добавлен автомобиль на площадке',ON_SITE_CONFIGURATION_CONFIRMED:'Конфигурация участника подтверждена',STAGE_CREATED:'Этап создан',STAGE_UPDATED:'Этап изменён',STAGE_CANCELLED:'Этап отменён',STAGE_RESULTS_PUBLISHED:'Результаты этапа опубликованы',STAGE_RESULTS_UNPUBLISHED:'Публикация результатов отменена',STAGE_CRITICAL_NOTICE_ACCEPTED:'Уведомление об изменении этапа принято к отправке',STAGE_CRITICAL_NOTICE_PARTIAL:'Уведомление об изменении этапа отправлено частично',HISTORICAL_RESULT_CREATED:'Добавлен исторический результат',HISTORICAL_RESULT_VERIFIED:'Исторический результат подтверждён',HISTORICAL_RESULT_CORRECTED:'Исторический результат исправлен',IMPORT_PREVIEW:'Предпросмотр импорта',IMPORT_COMMITTED:'Импорт зафиксирован',IMPORT_ROW_RESOLVED:'Строка импорта исправлена',DISQUALIFICATION_CREATED:'Дисквалификация назначена',DISQUALIFICATION_REVOKED:'Дисквалификация снята',SITE_SETTINGS_UPDATED:'Настройки сайта изменены',USER_CREATED:'Пользователь создан',USER_UPDATED:'Пользователь изменён',ROLE_CREATED:'Роль создана',ROLE_UPDATED:'Роль изменена',ROLE_DELETED:'Роль удалена',PERMANENT_DELETE:'Окончательное удаление',OFFLINE_INSPECTION_SYNCED:'Офлайн-инспекция синхронизирована',VENUE_STAGE_PACKAGE_IMPORTED:'Пакет этапа импортирован',VENUE_RETURN_REVIEW_DECIDED:'Принято решение о возврате офлайн-данных',VENUE_RETURN_DERIVED_REBUILT:'Пересчитаны данные после возврата этапа',VENUE_STAFF_CREATED:'Создан сотрудник офлайн-этапа',PARTICIPANT_PROFILES_MERGED:'Профили участников объединены',PROFILE_LINK_APPROVED:'Привязка профиля одобрена',TEAM_MANAGEMENT_MODE_CHANGED:'Изменён режим управления командой',TEAM_SELECTED:'Команда выбрана',TEAM_POST_PUBLISHED:'Публикация команды одобрена',TEAM_POST_RETURNED_FOR_REVISION:'Публикация команды возвращена на доработку',PUSH_TEMPLATES_UPDATED:'Шаблоны уведомлений изменены',PUSH_CONSENT_GRANTED:'Согласие на уведомления получено',PUSH_PREFERENCES_UPDATED:'Настройки уведомлений изменены',NEWSLETTER_CONSENT_REVOKED:'Согласие на рассылку отозвано',LEGAL_CONSENT_UPDATED:'Юридические согласия обновлены',PROTOCOL_PUBLICATION_CONSENT_ACCEPTED:'Получено согласие на публикацию протокола',USD_ID_ROTATED:'Код USD ID обновлён',PUBLIC_PAGE_VIEW:'Просмотр публичной страницы',
};
const verbs:Record<string,string>={CREATED:'Создано',UPDATED:'Изменено',DELETED:'Удалено',PUBLISHED:'Опубликовано',UNPUBLISHED:'Снято с публикации',APPROVED:'Одобрено',REJECTED:'Отклонено',VERIFIED:'Подтверждено',CANCELLED:'Отменено',CORRECTED:'Исправлено',REVOKED:'Отозвано',IMPORTED:'Импортировано',EXPORTED:'Экспортировано',MERGED:'Объединено',CONFIRMED:'Подтверждено',CHANGED:'Изменено',COMPLETED:'Завершено',RESTORED:'Восстановлено'};
const fields:Record<string,string>={value:'Результат',unit:'Единица измерения',place:'Место',notes:'Комментарий',reason:'Причина',status:'Статус',previousStatus:'Предыдущий статус',source:'Источник',scope:'Область действия',name:'Название',title:'Название',firstName:'Имя',lastName:'Фамилия',middleName:'Отчество',email:'Электронная почта',phone:'Телефон',city:'Город',brand:'Марка',model:'Модель',registrationNumber:'Госномер',participantNumber:'Номер участника',number:'Номер',className:'Класс',classNames:'Классы',directionName:'Направление',stageName:'Этап',participantName:'Участник',carName:'Автомобиль',teamName:'Команда',team:'Команда',role:'Роль',isActive:'Активен',isPublic:'Публичный профиль',isHistorical:'Историческая запись',registrationOpen:'Регистрация открыта',stageNumber:'Номер этапа',date:'Дата',startTimeMsk:'Начало (МСК)',venue:'Площадка',address:'Адрес',description:'Описание',registrationStartsAt:'Начало регистрации',registrationEndsAt:'Конец регистрации',resultsPublishedAt:'Дата публикации результатов',before:'До изменения',after:'После изменения',changedFields:'Изменённые поля',sections:'Изменённые разделы',added:'Добавлено',removed:'Удалено',classes:'Классы',permissions:'Права доступа',total:'Всего',count:'Количество',rowsCount:'Количество строк',success:'Успешно',failed:'Ошибки',accepted:'Принято',interrupted:'Прервано',deviceRecordedAt:'Время записи на устройстве',checkedAt:'Время инспекции',checkedByName:'Судья',legalVersion:'Версия документов',consentConfirmedAt:'Время подтверждения согласия',participantConsentRecorded:'Согласие участника записано',consentConfirmed:'Согласие подтверждено',configurationPending:'Оборудование не заполнено',registrationId:'Регистрация',registrationClassId:'Заявка на класс',stageId:'Этап',participantId:'Участник',carId:'Автомобиль',classId:'Класс',userId:'Пользователь',nested:'Дополнительные данные'};
const values:Record<string,string>={PASSED:'Допущен',FAILED:'Не допущен',PENDING:'Ожидает',ACTIVE:'Активен',CANCELLED:'Отменён',COMPLETED:'Завершён',DRAFT:'Черновик',PUBLISHED:'Опубликован',PRE_REGISTRATION:'Предварительная регистрация',ON_SITE:'На площадке',IMPORT:'Импорт',OFFLINE_SYNC:'Офлайн-синхронизация',ADMIN:'Администратор',PARTICIPANT:'Участник',DB:'дБ',MPS:'м/с',OTHER:'Другое',VERIFIED:'Подтверждён',NOT_REQUIRED:'Не требуется',APPROVED:'Одобрен',REJECTED:'Отклонён',true:'Да',false:'Нет'};
const record=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const clean=(v:unknown)=>typeof v==='string'?v.trim():'';
const hidden=(key:string)=>/password|passwd|token|secret|hash|credential|authorization|cookie|session|privatekey|apikey|signature|nonce|^id$|ids?$|^key$/i.test(key);
const human=(key:string)=>key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ');
const label=(key:string)=>fields[key]??human(key);
export function auditEntityName(key:string){return entities[key]??(human(key)||'Раздел не указан')}
export function auditActionName(key:string){
 if(actions[key])return actions[key];
 const [verb,...rest]=key.split('_').reverse(),entity=rest.reverse().join('').toLowerCase();
 const known=Object.keys(entities).find(k=>k.toLowerCase()===entity);
 return verbs[verb]&&known?verbs[verb]+': '+entities[known]:'Событие: '+(key||'тип не указан');
}
function scalar(value:unknown):string{
 if(value===null||value===undefined||value==='')return 'Не указано';
 if(typeof value==='boolean')return value?'Да':'Нет';
 if(typeof value==='string'){
  if(values[value])return values[value];
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/.test(value)){const date=new Date(value);if(Number.isFinite(date.getTime()))return date.toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК'}
  return value;
 }
 return typeof value==='number'?String(value):'Данные не сохранены';
}
function displayArray(items:unknown[],key:string):string|null{
 if(!items.length)return 'Пусто';
 if(items.every(v=>v==null||['string','boolean','number'].includes(typeof v)))return items.map(v=>key==='changedFields'&&typeof v==='string'?label(v):scalar(v)).join('; ');
 if(items.every(v=>typeof record(v).className==='string'||typeof record(record(v).class).name==='string'))return items.map(v=>{const row=record(v),name=row.className??row.class?.name;return name+(row.number!=null&&typeof row.number!=='object'?' (№'+scalar(row.number)+')':'')}).join('; ');
 return null;
}
function flatten(value:unknown,path:string[]=[]):Field[]{
 if(path.some(hidden))return [];
 const key=path.join('.')||'changes',fieldLabel=path.map(label).join(' / ')||'Состав классов';
 if(path.length>12)return [{key,label:fieldLabel,value:'Дополнительная вложенность (не отображается)'}];
 if(Array.isArray(value)){
  const compact=displayArray(value,path.at(-1)??'');
  return compact!==null?[{key,label:fieldLabel,value:compact}]:value.flatMap((v,i)=>flatten(v,[...path,'№'+(i+1)]));
 }
 if(value&&typeof value==='object')return Object.entries(record(value)).flatMap(([k,v])=>flatten(v,[...path,k]));
 return [{key,label:fieldLabel,value:scalar(value)}];
}
export function describeAuditEvent(item:Row,roleNames:Record<string,string>={}){
 const meta=record(item.metadata),context=record(item.context),user=record(item.user),reg=record(context.registration??meta.registration);
 const person=record(reg.participant??context.participant??meta.participant);
 const car=record(reg.car??context.car??meta.car);
 const stage=record(reg.stage??context.stage??meta.stage);
 const personName=[person.lastName,person.firstName,person.middleName].map(clean).filter(Boolean).join(' ')||clean(meta.participantName);
 const carName=[car.brand,car.model].map(clean).filter(Boolean).join(' ')||clean(meta.carName);
 const stageName=clean(stage.name)||clean(meta.stageName);
 const className=clean(context.className)||clean(meta.className);
 const number=context.number??reg.participantNumber??meta.participantNumber;
 const target=[number!=null&&Number(number)>0?'№'+number:'',personName,carName,className,stageName].filter(Boolean).join(' · ')||clean(context.label)||clean(meta.name)||auditEntityName(String(item.entity??''));
 const before=Object.hasOwn(meta,'before')?flatten(meta.before):[],after=Object.hasOwn(meta,'after')?flatten(meta.after):[];
 const changes:Change[]=[];
 if(Object.hasOwn(meta,'before')&&Object.hasOwn(meta,'after')){
  const b=new Map(before.map(x=>[x.key,x])),a=new Map(after.map(x=>[x.key,x]));
  for(const key of new Set([...b.keys(),...a.keys()])){
   const left=b.get(key),right=a.get(key);
   if(left?.value===right?.value)continue;
   changes.push({key,label:left?.label??right?.label??'Изменение',before:left?.value??'Не указано',after:right?.value??'Не указано'});
  }
 }
 const details=Object.entries(meta).filter(([k])=>!['before','after'].includes(k)).flatMap(([k,v])=>flatten(v,[k]));
 if(!Object.hasOwn(meta,'after'))details.push(...before.map(f=>({...f,key:'before.'+f.key,label:'До изменения / '+f.label})));
 if(!Object.hasOwn(meta,'before'))details.push(...after.map(f=>({...f,key:'after.'+f.key,label:'После изменения / '+f.label})));
 return {action:auditActionName(String(item.action??'')),entity:auditEntityName(String(item.entity??'')),actor:clean(user.name)||clean(user.email)||(item.userId?'Автор недоступен':'Автор не указан'),email:clean(user.name)?clean(user.email):'',role:clean(user.customRole?.name)||roleNames[user.role]||values[user.role]||'Роль не сохранена',target,changes,details,contextResolved:Boolean(Object.keys(context).length),hasSnapshots:Object.hasOwn(meta,'before')&&Object.hasOwn(meta,'after')};
}
