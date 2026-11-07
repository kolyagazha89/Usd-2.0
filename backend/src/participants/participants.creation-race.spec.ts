import {jest} from '@jest/globals';
import {ConflictException} from '@nestjs/common';
import {ParticipantsService} from './participants.service';
import type {AuthenticatedRequest} from '../auth/authenticated-request';
describe('new profile creation cannot overwrite a committed historical association',()=>{
 it('rejects a stale unlinked account and rolls its new participant back',async()=>{
  const stored={participantId:'historical-profile'};const participants:string[]=[];
  const tx:any={participant:{create:jest.fn(async()=>{participants.push('new-profile');return{id:'new-profile'}}),findUniqueOrThrow:jest.fn(async()=>({id:'new-profile'}))},user:{update:jest.fn(async({data}:any)=>Object.assign(stored,data)),updateMany:jest.fn(async()=>({count:0}))}};
  const db:any={user:{findUnique:jest.fn(async()=>({id:'user-1',isActive:true,participantId:null}))},siteSettings:{findUnique:jest.fn(async()=>({catalogs:{teams:[]}}))},participant:{findMany:jest.fn(async()=>[])},$transaction:jest.fn(async(callback:any)=>{try{return await callback(tx)}catch(error){participants.length=0;throw error}})};
  await expect(new ParticipantsService(db).createMe({user:{sub:'user-1'}} as AuthenticatedRequest,{firstName:'Synthetic',lastName:'Fixture'})).rejects.toBeInstanceOf(ConflictException);
  expect(stored.participantId).toBe('historical-profile');expect(participants).toHaveLength(0);
  expect(tx.user.updateMany).toHaveBeenCalledWith({where:{id:'user-1',participantId:null,isActive:true},data:{participantId:'new-profile',name:'Synthetic Fixture'}});
  expect(tx.user.update).not.toHaveBeenCalled();
 });
});
