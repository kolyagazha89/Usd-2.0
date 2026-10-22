import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { RegistrationsController } from './registrations.controller';

describe('staff account personal registrations',()=>{
 const service:any={create:jest.fn(),findOne:jest.fn(),cancel:jest.fn()};
 const controller=new RegistrationsController(service);
 beforeEach(()=>jest.clearAllMocks());

 it('submits as the logged-in participant, never with staff operational authority',async()=>{
  const request:any={user:{sub:'judge1',role:'PARTICIPANT',customRoleId:'r1',participantId:'person1'}};
  const body:any={stageId:'stage',participantId:'other',carId:'car1',configurationVersionId:'v1',classIds:['class1'],source:'ON_SITE',rulesAccepted:true};
  service.create.mockResolvedValue({id:'new'});
  await controller.createMyRegistration(request,body);
  const [scoped,actual]=(service.create as jest.Mock).mock.calls[0] as any[];
  expect(scoped.user).toEqual(expect.objectContaining({role:'PARTICIPANT',customRoleId:undefined,participantId:'person1'}));
  expect(actual.participantId).toBe('person1');
  expect(actual.source).toBe('PRE_REGISTRATION');
  expect(request.user.customRoleId).toBe('r1');
 });
 it('also restricts permanent ADMIN personal submission to their own participant',async()=>{
  const request:any={user:{sub:'admin',role:'ADMIN',participantId:'adminParticipant'}};
  await controller.createMyRegistration(request,{stageId:'s',carId:'c',classIds:['cl'],configurationVersionId:'v',source:'IMPORT'} as any);
  expect((service.create as jest.Mock).mock.calls[0][1]).toEqual(expect.objectContaining({participantId:'adminParticipant',source:'PRE_REGISTRATION'}));
 });
 it('rejects cancellation of another participant registration even for a judge',async()=>{
  const request:any={user:{sub:'judge1',role:'PARTICIPANT',customRoleId:'r1',participantId:'person1'}};
  service.findOne.mockResolvedValue({id:'regX',participantId:'another'});
  await expect(controller.cancelMyRegistration(request,'regX')).rejects.toBeInstanceOf(ForbiddenException);
  expect(service.cancel).not.toHaveBeenCalled();
 });
 it('allows cancellation of own registration using participant-scoped rights',async()=>{
  const request:any={user:{sub:'judge1',role:'PARTICIPANT',customRoleId:'r1',participantId:'person1'}};
  service.findOne.mockResolvedValue({id:'reg1',participantId:'person1'});
  service.cancel.mockResolvedValue({success:true});
  await controller.cancelMyRegistration(request,'reg1');
  const [id,scoped]=(service.cancel as jest.Mock).mock.calls[0] as any[];
  expect(id).toBe('reg1');
  expect(scoped.user.customRoleId).toBeUndefined();
 });
});
