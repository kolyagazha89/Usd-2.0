import {jest} from '@jest/globals';
import {BadRequestException} from '@nestjs/common';
import {classifyHistoricalLink,normalizeHistoricalLinkEmail} from './profile-link-diagnostics';
import {ProfileLinksService} from './profile-links.service';

const uid='123e4567-e89b-42d3-a456-426614174011',pid='123e4567-e89b-42d3-a456-426614174012';
const owner={id:uid,email:' MEMBER@EXAMPLE.COM ',participantId:null,emailVerifiedAt:new Date(),isActive:true};
const profile={id:pid,user:null};
describe('read-only ADMIN diagnosis of historical ownership',()=>{
 it('recognizes a normalized verified matching email without leaking either address',()=>{
  expect(normalizeHistoricalLinkEmail(' MEMBER@EXAMPLE.COM ')).toBe('member@example.com');
  const status=classifyHistoricalLink(owner,profile,{email:'member@example.com '});
  expect(status).toEqual({code:'SELF_LINK_AVAILABLE',canSelfLink:true});
  expect(JSON.stringify(status)).not.toContain('example.com');
 });
 it('does not invent a mapping when archived email is missing or differs',()=>{
  expect(classifyHistoricalLink(owner,profile,null).code).toBe('LEGACY_EMAIL_MISSING');
  expect(classifyHistoricalLink(owner,profile,{email:'other@example.com'}).code).toBe('LEGACY_EMAIL_DIFFERENT');
 });
 it('rejects inactive and unverified accounts and already occupied profiles',()=>{
  expect(classifyHistoricalLink({...owner,isActive:false},profile,{email:'member@example.com'}).code).toBe('ACCOUNT_INACTIVE');
  expect(classifyHistoricalLink({...owner,emailVerifiedAt:null},profile,{email:'member@example.com'}).code).toBe('EMAIL_NOT_VERIFIED');
  expect(classifyHistoricalLink(owner,{...profile,user:{id:'other'}},{email:'member@example.com'}).code).toBe('PROFILE_ALREADY_LINKED');
  expect(classifyHistoricalLink({...owner,participantId:'other'},profile,{email:'member@example.com'}).code).toBe('ACCOUNT_ALREADY_LINKED');
 });
 it('allows already-linked detection but never a second mutation',()=>{
  expect(classifyHistoricalLink({...owner,participantId:pid},{...profile,user:{id:uid}},{email:'member@example.com'}))
   .toEqual({code:'ALREADY_LINKED',canSelfLink:false});
 });
 it('queries only the specified pair and issues no updates, claims or audit on diagnosis',async()=>{
  const db:any={
   user:{findUnique:jest.fn(async()=>owner),update:jest.fn()},
   participant:{findUnique:jest.fn(async()=>profile),update:jest.fn()},
   participantLegacyEmail:{findUnique:jest.fn(async()=>({email:'member@example.com'}))},
   profileLinkRequest:{create:jest.fn()},
   auditLog:{create:jest.fn()},
   $transaction:jest.fn(),
  };
  const result=await new ProfileLinksService(db).diagnoseSelfLink(uid,pid);
  expect(result).toEqual({code:'SELF_LINK_AVAILABLE',canSelfLink:true});
  expect(db.user.findUnique).toHaveBeenCalledWith({where:{id:uid},select:{id:true,email:true,participantId:true,emailVerifiedAt:true,isActive:true}});
  expect(db.participant.findUnique).toHaveBeenCalledWith({where:{id:pid},select:{id:true,user:{select:{id:true}}}});
  expect(db.profileLinkRequest.create).not.toHaveBeenCalled();
  expect(db.auditLog.create).not.toHaveBeenCalled();
  expect(db.$transaction).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain('example.com');
 });
 it('rejects malformed identifiers without querying the database',async()=>{
  const db:any={user:{findUnique:jest.fn()},participant:{findUnique:jest.fn()},participantLegacyEmail:{findUnique:jest.fn()}};
  await expect(new ProfileLinksService(db).diagnoseSelfLink('bad-id',pid)).rejects.toBeInstanceOf(BadRequestException);
  expect(db.user.findUnique).not.toHaveBeenCalled();
 });
});
