type Named=string|{name?:string|null}|null;
type GateRow={
 id?:string;status?:string;source?:string;participantNumber?:number|null;
 participant?:{lastName?:string|null;firstName?:string|null;middleName?:string|null}|null;
 car?:{brand?:Named;model?:Named;registrationNumber?:string|null}|null;
 numbers?:{number?:number|null;isPrimary?:boolean}[]|null;
 classes?:{class?:{name?:string|null;direction?:{name?:string|null}|null}|null;number?:{number?:number|null}|null}[]|null;
};
type Stage={name?:string;city?:string;date?:string};
type Cell=string|number;
type Sheet={name:string;rows:Cell[][];widths:number[]};
const label=(value:Named|undefined):string=>typeof value==='string'?value:value?.name??'';
const fullName=(r:GateRow)=>[r.participant?.lastName,r.participant?.firstName,r.participant?.middleName].filter(Boolean).join(' ');
const carName=(r:GateRow)=>[label(r.car?.brand),label(r.car?.model)].filter(Boolean).join(' ');
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
const classLabel=(c:NonNullable<GateRow['classes']>[number])=>[c.class?.direction?.name,c.class?.name].filter(Boolean).join(' · ');
const numbers=(r:GateRow)=>Array.from(new Set([r.participantNumber,...(r.numbers??[]).map(n=>n.number),...(r.classes??[]).map(c=>c.number?.number)].filter(positive))).sort((a,b)=>a-b);
const classes=(r:GateRow,n:number)=> (r.classes??[]).filter(c=>(c.number?.number??r.participantNumber)===n).map(classLabel).filter(Boolean).join('; ');
export const GATE_PAPER_INSTRUCTIONS=[
 'До выезда: закройте онлайн-регистрацию, скачайте актуальный комплект выбранного этапа. Распечатайте листы (А4, альбомная ориентация, все столбцы на одной странице по ширине; повторять строку 3). Назначьте одного ответственного за выдачу номеров.',
 'Предрегистрация: найдите ФИО и автомобиль, проверьте госномер. Отметьте явку и оплату по действующему регламенту. Выдайте именно зарезервированные номера, включая дополнительные. Не создавайте повторную заявку.',
 'Новые участники: присвойте уникальную бумажную метку Б-001, Б-002 и далее. Запишите ФИО, авто, страну и госномер, классы, оплату и ответственного. Дополнительные номера обозначайте Б-001-1, Б-001-2 и т. д. Не используйте бумажные метки как цифровые номера сайта.',
 'Если требуется выдавать цифровые наклейки новым участникам: используйте один журнал, выбирайте свободные положительные номера с учётом всех занятых и уже выданных. Записывайте соответствие каждой наклейки бумажной метке. Не переиспользуйте номера неявившихся и отменённых на бумаге.',
 'На основном номере — максимум 5 классов, не более одного BassRace. Если основных классов пять, все BassRace получают дополнительные номера. Иначе первый BassRace может идти на основном, каждый следующий — на отдельном.',
 'Изменения классов записывайте с указанием старого и нового класса, номера, причины и ответственного. Не стирайте исходную запись. Инспекция: допуск/отказ, при отказе обязательна причина; результаты — только по допущенным классам.',
 'До регистрации получите действующие согласия и подтверждение регламента на предусмотренных организатором бланках. Отметка в журнале не заменяет согласие. Храните листы у ответственного, не публикуйте персональные данные.',
 'После восстановления: откройте выбранный этап и сначала проверьте существующие заявки по ФИО и авто. Перенесите новые заявки через регистрацию на месте, не создавая дублей профиля. Сайт назначает минимальные свободные номера автоматически: запишите соответствие бумажного и фактического номера, включая BassRace; не обещайте совпадение.',
 'Перенесите изменения классов и инспекцию, затем результаты по точному соответствию участника, автомобиля, класса и номера. Не вносите данные одновременно на двух серверах. Отметьте перенос каждой записи после проверки; сохраните оригиналы в защищённом месте.',
] as const;
export function buildGatePaperSheets(stage:Stage,rows:readonly GateRow[],observedAt:string):Sheet[]{
 const context='USD · '+[stage.name,stage.city,stage.date?.slice(0,10)].filter(Boolean).join(' · ');
 const stamp='Снимок: '+observedAt+' (UTC); номера и классы актуальны на момент выгрузки';
 const active=rows.filter(r=>r.status==='ACTIVE').slice().sort((a,b)=>(a.participantNumber??0)-(b.participantNumber??0));
 const pre=active.filter(r=>r.source==='PRE_REGISTRATION').map(r=>[
  r.participantNumber??'',fullName(r),carName(r),r.car?.registrationNumber??'',
  (r.classes??[]).filter(c=>!positive(c.number?.number)||c.number?.number===r.participantNumber).map(classLabel).filter(Boolean).join('; '),
  numbers(r).filter(n=>n!==r.participantNumber).map(n=>n+': '+classes(r,n)).join('; '),'','','','',
 ]);
 const occupied=active.flatMap(r=>numbers(r).map(n=>[n,n===r.participantNumber?'Основной':'Доп.',fullName(r),classes(r,n),r.participantNumber??'',''])).sort((a,b)=>Number(a[0])-Number(b[0]));
 const sheet=(name:string,headers:string[],data:Cell[][],widths:number[]):Sheet=>({name,rows:[[context],[stamp],headers,...data],widths});
 return [
  sheet('Предрегистрация',['№ основной','ФИО','Автомобиль','Госномер','Классы основного номера','Доп. номера и классы','Явка','Оплата','Изменения / примечания','Перенесено'],pre,[11,29,20,13,43,43,9,10,26,12]),
  sheet('Занятые номера',['№','Тип','ФИО','Классы номера','№ основной','Выдан / примечание'],occupied,[10,12,31,48,14,29]),
  sheet('Новые заявки',['Бумажная метка','ФИО','Авто (марка / модель)','Страна / госномер','Основные классы','Доп. номера / BassRace','Оплата','Согласия / регламент','Выдал','Номер(а) сайта / перенос'],Array.from({length:20},()=>Array<string>(10).fill('')),[15,29,25,20,40,37,12,20,14,24]),
  sheet('Инспекция и результаты',['Метка / номер','ФИО / авто','Класс','Допуск / отказ','Причина / изменение','Результат / единица','Судья','№ сайта / перенесено'],Array.from({length:30},()=>Array<string>(8).fill('')),[17,29,24,18,32,25,18,24]),
  {name:'Инструкция',rows:[['USD · Резервная работа на въезде'],[context],...GATE_PAPER_INSTRUCTIONS.map((s,i)=>[i+1,s])],widths:[12,120]},
 ];
}
