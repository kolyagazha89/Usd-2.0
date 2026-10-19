import { jest } from '@jest/globals';
import { ImportsService } from './imports.service';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
function setup(global = true) {
 const rows:any[] = [
  { id:'done',type:'RESULT',rowNumber:1,status:'COMMITTED',rawData:{'ФИО':'Петров Иван'},normalizedData:{},resolution:{} },
  { id:'pending',type:'RESULT',rowNumber:2,status:'WARNING',rawData:{'ФИО':'Сидоров Пётр'},normalizedData:{},resolution:null },
  { id:'helper',type:'REGISTRATION',rowNumber:1,status:'WARNING',rawData:{},normalizedData:{},resolution:null },
 ];
 const tx:any = { $queryRaw:jest.fn(async()=>[]), importJob:{findUnique:jest.fn(async()=>({id:'job',stageId:'stage',status:'DRAFT',metadata:{historicalResults:true,...(global?{globalBatchId:'batch'}:{})},rows})),update:jest.fn(async()=>({}))},importRow:{update:jest.fn()},stage:{update:jest.fn()} };
 return {tx,rows,service:new ImportsService({$transaction:async(fn:any)=>fn(tx)} as any,new NameNormalizerService())};
}
it('keeps pending source rows in DRAFT while previously committed rows remain intact',async()=>{
 const {service,tx,rows}=setup();
 const response=await service.commitImport('job',undefined,{allowHistoricalPartial:true});
 expect(response).toMatchObject({status:'DRAFT',pendingResults:1,rows:[]});
 expect(tx.importJob.update).toHaveBeenCalledWith({where:{id:'job'},data:{status:'DRAFT'}});
 expect(tx.importRow.update).not.toHaveBeenCalled();expect(tx.stage.update).not.toHaveBeenCalled();
 expect(rows.map(row=>row.status)).toEqual(['COMMITTED','WARNING','WARNING']);
});
it('does not silently enable partial commits for a normal historical job',async()=>{
 const {service,tx}=setup(false);
 await expect(service.commitImport('job',undefined,{allowHistoricalPartial:true})).rejects.toThrow('только общей задаче');
 expect(tx.importJob.update).not.toHaveBeenCalled();
});
it('allows a strict completion of a global job after all remaining source rows were handled',async()=>{
 const {service,tx,rows}=setup();rows[1].status='COMMITTED';
 const response=await service.commitImport('job');
 expect(response).toMatchObject({status:'COMMITTED',pendingResults:0,rows:[]});
 expect(tx.importRow.update).not.toHaveBeenCalled();
});
