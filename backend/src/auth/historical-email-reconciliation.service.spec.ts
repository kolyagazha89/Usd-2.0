import {jest} from '@jest/globals';
import {NameNormalizerService} from '../common/names/name-normalizer.service';
import {HistoricalEmailReconciliationService} from './historical-email-reconciliation.service';
function fixture(){
 const db:any={
  participant:{findMany:jest.fn(async()=>[{id:'one',firstName:'Иван',lastName:'Иванов',middleName:null,registrations:[{stageId:'stage-a',participantNumber:1},{stageId:'stage-b',participantNumber:22}]}])},
  participantLegacyEmail:{findMany:jest.fn(async()=>[])},participantMergeRedirect:{findMany:jest.fn(async()=>[])},
  stage:{findMany:jest.fn(async()=>[{id:'stage-b',stageNumber:2,season:{year:2026}}])},
  importRow:{findMany:jest.fn(async()=>[{id:'row-1',rawData:{'Фамилия и имя':'Иванов Иван',Email:' ivan@example.ru ','Номер участника':22},importJob:{stageId:'stage-b'}}])},
  historicalImportBatch:{findMany:jest.fn(async()=>[])},
 };
 const tx:any={$executeRaw:jest.fn(async()=>[]),participantMergeRedirect:{findMany:jest.fn(async()=>[])},
  participantLegacyEmail:{findFirst:jest.fn(async()=>null),findUnique:jest.fn(async()=>null),createMany:jest.fn(async()=>({count:1}))},
  auditLog:{create:jest.fn(async()=>({id:'log'}))}};
 db.$transaction=jest.fn(async(fn:(tx:any)=>Promise<unknown>)=>fn(tx));
 return {db,tx};
}
describe('live database email source backfill',()=>{
 it('scans participant stage registrations against import rawData without relying on a source XLSX file',async()=>{
  const {db}=fixture();const result=await new HistoricalEmailReconciliationService(db,new NameNormalizerService()).preview();
  expect(result).toMatchObject({rowsWithEmail:1,matchedRows:1,safeProfiles:1,applied:false});
 });
 it('writes an email only after ADMIN confirmation, with one audit event',async()=>{
  const {db,tx}=fixture();const result=await new HistoricalEmailReconciliationService(db,new NameNormalizerService()).apply('admin');
  expect(result).toMatchObject({updatedProfiles:1,applied:true});
  expect(tx.participantLegacyEmail.createMany).toHaveBeenCalledWith({data:[{participantId:'one',email:'ivan@example.ru'}],skipDuplicates:true});
  expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({userId:'admin',action:'HISTORICAL_EMAIL_RECONCILIATION'})});
 });
});
