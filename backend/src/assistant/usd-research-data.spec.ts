import {jest} from '@jest/globals';
import {queryUsdResearchData} from './usd-research-data';
describe('USD research data',()=>{
 it('lets model group registrations by stage and select status independently',async()=>{
  const groupBy=jest.fn<(query:any)=>Promise<any[]>>().mockResolvedValue([{stageId:'stage-1',_count:{_all:7}}]);
  const response=await queryUsdResearchData({registration:{groupBy}} as any,{entity:'registrations',operation:'group',groupBy:'stageId',filters:{status:'ACTIVE'},limit:10});
  expect(response).toMatchObject({rows:[{stageId:'stage-1',_count:{_all:7}}]});
  expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({by:['stageId'],where:{stage:{isDeleted:false},status:'ACTIVE'},take:10}));
 });
 it('rejects unapproved entities, fields, operators and mutation attempts',async()=>{
  const count=jest.fn();
  const prisma={registration:{count}} as any;
  for(const args of [{entity:'users',operation:'list'},{entity:'registrations',operation:'delete'},{entity:'registrations',operation:'count',filters:{phone:'x'}},{entity:'registrations',operation:'count',filters:{status:{not:'ACTIVE'}}}]){
   expect(await queryUsdResearchData(prisma,args)).toMatchObject({error:expect.any(String)});
  }
  expect(count).not.toHaveBeenCalled();
 });
 it('exposes only explicit safe scalar columns and limits list results',async()=>{
  const findMany=jest.fn<(query:any)=>Promise<any[]>>().mockResolvedValue([]);
  await queryUsdResearchData({registration:{findMany}} as any,{entity:'registrations',operation:'list',limit:1000});
  const query=findMany.mock.calls[0][0];
  expect(query.take).toBe(25);
  expect(query.select).not.toHaveProperty('configurationSnapshot');
  expect(query.select).not.toHaveProperty('participantId');
  expect(query.select).not.toHaveProperty('carId');
 });
});
