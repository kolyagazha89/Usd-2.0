import {resolveAuditContexts} from './audit-context';

describe('audit context enrichment',()=>{
 it('resolves current registration/class names for result updates and deleted results in bounded batch reads',async()=>{
  const db:any={
   result:{findMany:jest.fn().mockResolvedValue([{id:'m1',registrationId:'r1',registrationClassId:'rc1'}])},
   registrationClass:{findMany:jest.fn().mockResolvedValue([{id:'rc1',registrationId:'r1',class:{name:'2x2'},number:{number:42}}])},
   registration:{findMany:jest.fn().mockResolvedValue([{id:'r1',participantNumber:7,participant:{id:'p1',firstName:'Иван',lastName:'Иванов'},car:{id:'c1',isActive:false,brand:'Hidden brand',model:'Secret'},stage:{id:'s1',name:'Краснодар'}}])},
  };
  const rows=[{id:'a',entity:'Result',entityId:'m1',metadata:{before:{value:'140'},after:{value:'141'}}},{id:'b',entity:'Result',entityId:'deleted',metadata:{registrationId:'r1',registrationClassId:'rc1'}},{id:'c',entity:'Result',entityId:'gone',metadata:null}];
  const [a,b,c]=await resolveAuditContexts(db,rows);
  expect(a.context).toMatchObject({registration:{participant:{firstName:'Иван'},car:{brand:'Автомобиль скрыт'}},className:'2x2',number:42});
  expect(b.context).toEqual(a.context);
  expect(c.context).toEqual({});
  expect(db.result.findMany).toHaveBeenCalledTimes(1);
  expect(db.registrationClass.findMany).toHaveBeenCalledTimes(1);
  expect(db.registration.findMany).toHaveBeenCalledTimes(1);
  expect(a.metadata).toEqual(rows[0].metadata);
 });
 it('does not query missing references or invent a person for a deleted object',async()=>{
  const [row]=await resolveAuditContexts({} as any,[{id:'a',entity:'Unknown',entityId:null,metadata:{name:'Старый объект'}}]);
  expect(row.context).toEqual({});
 });
});
