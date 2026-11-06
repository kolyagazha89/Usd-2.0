import {jest} from '@jest/globals';
import {BadRequestException,NotFoundException} from '@nestjs/common';
import {ProfileLinksService} from './profile-links.service';

const sourceId='123e4567-e89b-42d3-a456-426614174001';
const targetId='123e4567-e89b-42d3-a456-426614174002';
const profile=(id:string,plate:string)=>({
 id,firstName:'Иван',lastName:'Иванов',middleName:null,birthDate:new Date('1990-05-20'),legacyId:null,usdIdToken:null,
 user:null,teamMembership:null,
 cars:[{id:id+'-car',registrationCountry:'RU',registrationNumber:plate,_count:{configurations:2}}],
 registrations:[{id:id+'-registration',stageId:'st1',status:'ACTIVE',_count:{numbers:2,classes:3,results:1}}],
 _count:{stageInspections:1,disqualifications:0,profileLinkRequests:0},
});
describe('ADMIN duplicate preview must never mutate historical data',()=>{
 const db=()=>{
  const prisma:any={
   participant:{findMany:jest.fn(async()=>[profile(sourceId,'A123AA72'),profile(targetId,'А123АА72')])},
   record:{count:jest.fn(async()=>2)},
   user:{update:jest.fn()},registration:{updateMany:jest.fn()},car:{updateMany:jest.fn()},
   auditLog:{create:jest.fn()},$transaction:jest.fn(),
  };
  return prisma;
 };
 it('reports matching stages and transliterated plate aliases with accurate history counts',async()=>{
  const prisma=db(),service=new ProfileLinksService(prisma);
  const result=await service.previewDuplicates(sourceId,targetId);
  expect(result.state).toBe('DRY_RUN_ONLY');
  expect(result.canMerge).toBe(false);
  expect(result.counts.source).toMatchObject({cars:1,configurations:2,registrations:1,classes:3,results:1,records:2});
  expect(result.conflicts.map(item=>item.code)).toEqual(['SAME_STAGE','DUPLICATE_CARS']);
  expect(prisma.participant.findMany).toHaveBeenCalledTimes(1);
  expect(prisma.user.update).not.toHaveBeenCalled();
  expect(prisma.car.updateMany).not.toHaveBeenCalled();
  expect(prisma.registration.updateMany).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.auditLog.create).not.toHaveBeenCalled();
 });
 it('rejects the same participant without touching the database',async()=>{
  const prisma=db(),service=new ProfileLinksService(prisma);
  await expect(service.previewDuplicates(sourceId,sourceId)).rejects.toBeInstanceOf(BadRequestException);
  expect(prisma.participant.findMany).not.toHaveBeenCalled();
 });
 it('does not disclose partial previews when one profile is missing',async()=>{
  const prisma=db(),service=new ProfileLinksService(prisma);
  prisma.participant.findMany.mockResolvedValueOnce([profile(sourceId,'A123AA72')]);
  await expect(service.previewDuplicates(sourceId,targetId)).rejects.toBeInstanceOf(NotFoundException);
 });
});
