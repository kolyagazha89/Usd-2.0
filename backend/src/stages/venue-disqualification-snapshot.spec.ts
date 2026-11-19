import {ServiceUnavailableException} from '@nestjs/common';
import {readSignedVenueDisqualifications,readSignedVenueBanSnapshot} from './venue-disqualification-snapshot';

const stageId='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
const seasonId='d510f672-79f7-44eb-8173-2a8ff94b1c0e';
const participantId='e510f672-79f7-44eb-8173-2a8ff94b1c0e';
const other='f510f672-79f7-44eb-8173-2a8ff94b1c0e';
const make=(records:unknown,stage=stageId)=>({
 siteSettings:{findUnique:async()=>({registration:{
  venueDisqualificationSnapshot:{stageId:stage,generatedAt:new Date().toISOString(),records},
 }})},
});
describe('signed offline disciplinary admission',()=>{
 it('applies only the signed active FORMAT/SEASON/STAGE bans of this participant and stage',async()=>{
  const rows=[
   {id:'a510f672-79f7-44eb-8173-2a8ff94b1c0e',participantId,scope:'FORMAT',seasonId:null,stageId:null},
   {id:'b510f672-79f7-44eb-8173-2a8ff94b1c0e',participantId,scope:'SEASON',seasonId,stageId:null},
   {id:'a610f672-79f7-44eb-8173-2a8ff94b1c0e',participantId,scope:'STAGE',seasonId:null,stageId},
   {id:'b610f672-79f7-44eb-8173-2a8ff94b1c0e',participantId:other,scope:'FORMAT',seasonId:null,stageId:null},
  ];
  const result=await readSignedVenueDisqualifications(make(rows),participantId,stageId,seasonId);
  expect(result.map(x=>x.scope)).toEqual(['FORMAT','SEASON','STAGE']);
  expect(await readSignedVenueDisqualifications(make(rows),other,stageId,seasonId)).toHaveLength(1);
 });
 it('exposes the same complete signed active ban list for offline ADMIN view',async()=>{
  const rows=[
   {id:'a510f672-79f7-44eb-8173-2a8ff94b1c0e',participantId,scope:'FORMAT',seasonId:null,stageId:null},
   {id:'b610f672-79f7-44eb-8173-2a8ff94b1c0e',participantId:other,scope:'STAGE',seasonId:null,stageId},
  ];
  expect(await readSignedVenueBanSnapshot(make(rows),stageId,seasonId)).toEqual(rows);
  await expect(readSignedVenueBanSnapshot(make(null),stageId,seasonId))
   .rejects.toThrow(ServiceUnavailableException);
 });
 it('fails closed when no signed list exists, when it targets another stage, and when malformed',async()=>{
  await expect(readSignedVenueDisqualifications({siteSettings:{findUnique:async()=>({registration:{}})}},
   participantId,stageId,seasonId)).rejects.toThrow(ServiceUnavailableException);
  await expect(readSignedVenueDisqualifications(make([],'wrong-stage'),participantId,stageId,seasonId))
   .rejects.toThrow(ServiceUnavailableException);
  await expect(readSignedVenueDisqualifications(make([{id:'broken'}]),participantId,stageId,seasonId))
   .rejects.toThrow(ServiceUnavailableException);
 });
 it('rejects a missing signed policy even if the local Disqualification table happens to be empty',async()=>{
  const tx={siteSettings:{findUnique:async()=>null},disqualification:{findMany:async()=>[]}};
  await expect(readSignedVenueDisqualifications(tx,participantId,stageId,seasonId))
   .rejects.toThrow(ServiceUnavailableException);
 });
});
