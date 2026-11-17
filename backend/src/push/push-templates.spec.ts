import {jest} from '@jest/globals';
import {BadRequestException,ConflictException} from '@nestjs/common';
import {PushService} from './push.service';
import {DEFAULT_PUSH_TEMPLATES,renderPushTemplate,validatePushTemplates} from './push-templates';

describe('admin-editable PUSH templates',()=>{
 const makeDb=()=>{
  let registration:any={enabled:true,emailTemplates:[{trigger:'AUTH_EMAIL_VERIFICATION'}]};
  const db:any={
   siteSettings:{
    findUnique:jest.fn(async()=>({id:'default',registration})),
    update:jest.fn(async({data}:any)=>{registration=data.registration;return {registration}}),
   },
   auditLog:{create:jest.fn(async()=>({id:'audit'}))},
   $executeRaw:jest.fn(async()=>0),
   $transaction:jest.fn(async(fn:any)=>fn(db)),
   profileLinkRequest:{findMany:jest.fn(async()=>[{id:'pending'}])},
   pushSubscription:{findMany:jest.fn(async()=>[{id:'admin-device'}])},
   pushMessage:{findUnique:jest.fn(async()=>null),create:jest.fn(async({data}:any)=>data)},
  };
  const transport:any={configured:()=>true};
  const audit:any={log:jest.fn(async()=>undefined)};
  return {db,audit,service:new PushService(db,transport,audit),getRegistration:()=>registration};
 };
 it('provides editable defaults for automatic notices without editing recipient or destination',async()=>{
  const {service}=makeDb();
  const {templates,revision}=await service.listTemplates();
  expect(revision).toMatch(/^[a-f0-9]{64}$/);
  expect(templates.map((t:any)=>t.key)).toEqual(DEFAULT_PUSH_TEMPLATES.map(t=>t.key));
  expect(templates.find((t:any)=>t.key==='profileLinkRequest')).toMatchObject({
   enabled:true,title:expect.any(String),body:expect.any(String),
  });
  expect(templates.some((t:any)=>t.key==='profileLinked')).toBe(false);
 });
 it('saves a validated edit without changing mail templates and without sending anything',async()=>{
  const {db,service,getRegistration}=makeDb();
  const before=await service.listTemplates();
  const edited=before.templates.map((x:any)=>x.key==='profileLinkRequest'
   ? {...x,title:'USD · Новая заявка',body:'Откройте список заявок и проверьте участника.'}:x);
  const saved=await service.updateTemplates('admin-uuid',{revision:before.revision,templates:edited});
  expect(saved.templates.find((x:any)=>x.key==='profileLinkRequest').title).toBe('USD · Новая заявка');
  expect(getRegistration().emailTemplates).toEqual([{trigger:'AUTH_EMAIL_VERIFICATION'}]);
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
   action:'PUSH_TEMPLATES_UPDATED',entity:'SiteSettings',entityId:'default',userId:'admin-uuid',
  })}));
  expect(db.pushMessage.create).not.toHaveBeenCalled();
  await expect(service.updateTemplates('admin-uuid',{revision:before.revision,templates:edited})).rejects.toBeInstanceOf(ConflictException);
 });
 it('rejects invalid limits, unknown variables and missing templates',async()=>{
  const {service}=makeDb();
  const current=await service.listTemplates();
  await expect(service.updateTemplates('admin',{revision:current.revision,templates:current.templates.slice(0,-1)})).rejects.toBeInstanceOf(BadRequestException);
  const bad=current.templates.map((t:any)=>t.key==='profileLinkRequest'?{...t,body:'{{email}}'}:t);
  await expect(service.updateTemplates('admin',{revision:current.revision,templates:bad})).rejects.toBeInstanceOf(BadRequestException);
  const tooLong=current.templates.map((t:any)=>t.key==='profileLinkRequest'?{...t,title:'a'.repeat(81)}:t);
  await expect(service.updateTemplates('admin',{revision:current.revision,templates:tooLong})).rejects.toBeInstanceOf(BadRequestException);
 });
 it('renders only explicitly supported stage-name variables and bounds output sizes',()=>{
  const templates=validatePushTemplates(DEFAULT_PUSH_TEMPLATES);
  const message=renderPushTemplate(templates,'stageReminder1d',{stageName:'Супер-этап '.repeat(100)});
  expect(message?.body.length).toBeLessThanOrEqual(240);
  expect(message?.title.length).toBeLessThanOrEqual(80);
  expect(message?.body).not.toContain('{{');
  const off=templates.map(x=>x.key==='profileLinkRequest'?{...x,enabled:false}:x);
  expect(renderPushTemplate(off,'profileLinkRequest')).toBeNull();
 });
 it('uses saved profile-request wording but never queues profile-linked PUSH',async()=>{
  const {db,service}=makeDb();
  const before=await service.listTemplates();
  const edited=before.templates.map((x:any)=>x.key==='profileLinkRequest'?{...x,title:'USD · Заявка',body:'Поступила новая заявка'}:x);
  await service.updateTemplates('admin-uuid',{revision:before.revision,templates:edited});
  await service.scheduleProfileLinks();
  expect(db.pushMessage.create).toHaveBeenCalledTimes(1);
  expect(db.pushMessage.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
   title:'USD · Заявка',body:'Поступила новая заявка',eventKey:'profile-link-request:pending',path:'/admin/profile-links',
  })}));
 });
});
