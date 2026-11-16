import {jest} from '@jest/globals';
import {ParticipantsService} from './participants.service';
import type {AuthenticatedRequest} from '../auth/authenticated-request';

const request = {user:{sub:'account'}} as AuthenticatedRequest;
const name = {firstName:'Synthetic',lastName:'Participant'};
function database() {
  let stored: Record<string,unknown> | undefined;
  const participant = {
    create: jest.fn(async ({data}:any) => (stored={id:'new-profile',...data})),
    findUniqueOrThrow: jest.fn(async () => stored),
    findMany: jest.fn(async () => []),
  };
  const user = {
    findUnique: jest.fn(async () => ({id:'account',isActive:true,role:'ADMIN',participantId:null})),
    updateMany: jest.fn(async () => ({count:1})),
  };
  const db:any = {participant,user,siteSettings:{findUnique:jest.fn(async()=>({catalogs:{teams:[]}}))}};
  db.$transaction=jest.fn(async (callback:any)=>callback(db));
  return db;
}
describe('new participant profile visibility',()=>{
  it.each([
    ['omitted',undefined,false],
    ['explicitly private',false,false],
    ['explicitly public',true,true],
  ] as const)('self-service creation is %s',async (_label,isPublic,expected)=>{
    const result=await new ParticipantsService(database()).createMe(request,{...name,...(isPublic===undefined?{}:{isPublic})});
    expect(result.isPublic).toBe(expected);
  });
  it.each([
    ['omitted',undefined,false],
    ['explicitly private',false,false],
    ['explicitly public',true,true],
  ] as const)('admin creation is %s',async (_label,isPublic,expected)=>{
    const result=await new ParticipantsService(database()).createParticipant(request,{...name,...(isPublic===undefined?{}:{isPublic})});
    expect(result.isPublic).toBe(expected);
  });
});
