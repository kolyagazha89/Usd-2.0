import {ValidationPipe} from '@nestjs/common';
import {jest} from '@jest/globals';
import {ParticipantsService} from './participants.service';
import {UpdateParticipantDto} from './dto/participant.dto';
import type {AuthenticatedRequest} from '../auth/authenticated-request';

describe('personal-data PATCH preserves team membership',()=>{
 const pipe=new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true});
 async function update(body:Record<string,unknown>){
  let stored={id:'participant-1',firstName:'Fixture',lastName:'Participant',city:'Тюмень',team:'Fixture Team'};
  const prisma:any={
   user:{findUnique:jest.fn().mockResolvedValue({id:'user-1',isActive:true,participantId:stored.id}),updateMany:jest.fn().mockResolvedValue({count:1})},
   participant:{findUnique:jest.fn().mockImplementation(async()=>stored),
    findMany:jest.fn().mockImplementation(async()=>[{team:stored.team}]),
    update:jest.fn().mockImplementation(async(args:any)=>{stored={...stored,...args.data};return stored})},
   siteSettings:{findUnique:jest.fn().mockResolvedValue({catalogs:{teams:['Fixture Team']}})},
  };
  const dto=await pipe.transform(body,{type:'body',metatype:UpdateParticipantDto});
  const service=new ParticipantsService(prisma);
  await service.updateMe({user:{sub:'user-1'}} as AuthenticatedRequest,dto);
  return {stored,dto};
 }

 it('does not clear a team omitted from an actual transformed DTO',async()=>{
  const {stored,dto}=await update({city:'Омск'});
  expect(Object.prototype.hasOwnProperty.call(dto,'team')).toBe(true);
  expect(dto.team).toBeUndefined();
  expect(stored.city).toBe('Омск');
  expect(stored.team).toBe('Fixture Team');
 });

 it('retains explicit null semantics for existing API clients',async()=>{
  expect((await update({city:'Омск',team:null})).stored.team).toBeNull();
 });

 it('still validates and canonicalizes an explicitly supplied team',async()=>{
  expect((await update({team:'fixture team'})).stored.team).toBe('Fixture Team');
 });
});
