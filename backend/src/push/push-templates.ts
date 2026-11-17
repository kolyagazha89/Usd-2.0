import {BadRequestException} from '@nestjs/common';
import {createHash} from 'node:crypto';

export const PUSH_TEMPLATE_KEYS = [
 'profileLinkRequest','catalogRequest','registrationOpen',
 'stageReminder3d','stageReminder1d','configurationPending',
] as const;
export type PushTemplateKey=typeof PUSH_TEMPLATE_KEYS[number];
export type PushTemplate={
 key:PushTemplateKey;label:string;description:string;
 enabled:boolean;title:string;body:string;
};
const DEFAULTS:PushTemplate[]=[
 {key:'profileLinkRequest',label:'Новая заявка на привязку',description:'Только администраторы, пока заявка ожидает решения.',enabled:true,
  title:'USD · Заявка на привязку профиля',body:'Участник запросил привязку существующего профиля. Проверьте заявку в административной панели.'},
 {key:'catalogRequest',label:'Запрос на добавление оборудования',description:'Только администраторы, пока запрос ожидает решения.',enabled:true,
  title:'USD · Запрос оборудования',body:'Поступил запрос на добавление комплектующего. Проверьте центр уведомлений администраторов.'},
 {key:'registrationOpen',label:'Открытие регистрации',description:'Подписчики темы «Открытие регистрации».',enabled:true,
  title:'Открыта регистрация USD',body:'{{stageName}}'},
 {key:'stageReminder3d',label:'За три дня до этапа',description:'Участники этапа, включившие напоминания.',enabled:true,
  title:'До этапа USD три дня',body:'{{stageName}}'},
 {key:'stageReminder1d',label:'За день до этапа',description:'Участники этапа, включившие напоминания.',enabled:true,
  title:'Этап USD завтра',body:'{{stageName}}'},
 {key:'configurationPending',label:'Заполнение конфигурации',description:'Зарегистрированные на площадке участники через 1/7/14 дней после этапа.',enabled:true,
  title:'USD · заполните конфигурацию',body:'После этапа «{{stageName}}» необходимо заполнить аудиосистему автомобиля перед следующей регистрацией.'},
];
export const DEFAULT_PUSH_TEMPLATES:PushTemplate[]=DEFAULTS.map(t=>({...t}));
const stageKeys=new Set<PushTemplateKey>(['registrationOpen','stageReminder3d','stageReminder1d','configurationPending']);
const hasInvalidVariables=(key:PushTemplateKey,value:string)=>{
 const allowed=stageKeys.has(key)?'{{stageName}}':null;
 const remaining=allowed?value.replaceAll(allowed,''):value;
 return remaining.includes('{{')||remaining.includes('}}');
};
function validFields(key:PushTemplateKey,value:unknown):value is {enabled:boolean;title:string;body:string}{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const t=value as Record<string,unknown>;
 return typeof t.enabled==='boolean'&&typeof t.title==='string'&&typeof t.body==='string'
  && t.title.trim().length>0&&t.title.length<=80
  && t.body.trim().length>0&&t.body.length<=240
  && !hasInvalidVariables(key,t.title)&&!hasInvalidVariables(key,t.body);
}
export function loadPushTemplates(registration:unknown):PushTemplate[]{
 const reg=registration&&typeof registration==='object'&&!Array.isArray(registration)?registration as Record<string,unknown>:{};
 const raw=Array.isArray(reg.pushTemplates)?reg.pushTemplates:[];
 return DEFAULT_PUSH_TEMPLATES.map(def=>{
  const saved=raw.find((v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)&&(v as any).key===def.key);
  return validFields(def.key,saved)?{...def,enabled:saved.enabled,title:saved.title,body:saved.body}:{...def};
 });
}
export function validatePushTemplates(input:unknown):PushTemplate[]{
 if(!Array.isArray(input)||input.length!==DEFAULT_PUSH_TEMPLATES.length)
  throw new BadRequestException('Передайте полный список шаблонов PUSH.');
 const seen=new Set<string>();
 for(const row of input){
  const key=(row as Record<string,unknown>|null)?.key;
  if(typeof key!=='string'||!(PUSH_TEMPLATE_KEYS as readonly string[]).includes(key)||seen.has(key))
   throw new BadRequestException('Неверный или повторяющийся тип PUSH.');
  seen.add(key);
  if(!validFields(key as PushTemplateKey,row))
   throw new BadRequestException('Проверьте длину и переменные шаблона PUSH.');
 }
 return DEFAULT_PUSH_TEMPLATES.map(def=>{
  const value=input.find((v:PushTemplate)=>v.key===def.key) as PushTemplate;
  return {...def,enabled:value.enabled,title:value.title.trim(),body:value.body.trim()};
 });
}
export function pushTemplateRevision(templates:PushTemplate[]):string{
 return createHash('sha256').update(JSON.stringify(templates.map(({key,enabled,title,body})=>({key,enabled,title,body})))).digest('hex');
}
export function renderPushTemplate(templates:PushTemplate[],key:PushTemplateKey,vars:{stageName?:string}={}):{title:string;body:string}|null{
 const template=templates.find(t=>t.key===key);
 if(!template?.enabled)return null;
 const stageName=String(vars.stageName||'этап USD');
 const render=(source:string,max:number)=>source.replaceAll('{{stageName}}',stageName).slice(0,max);
 return {title:render(template.title,80),body:render(template.body,240)};
}
