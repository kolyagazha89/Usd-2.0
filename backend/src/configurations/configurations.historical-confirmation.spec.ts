import {jest} from '@jest/globals';
import {ForbiddenException,NotFoundException} from '@nestjs/common';
import {ConfigurationsService} from './configurations.service';

describe('participant confirmation of final 2026 configuration',()=>{
 const request={user:{sub:'owner',role:'PARTICIPANT'}};
 const dto={name:'Финал 2026',vibrationIsolation:'ComfortMat',additionalDescription:'Сборка на финале',headUnits:[],audioComponents:[],amplifiers:[],batteries:[],generators:[]};
 let db:any;let service:ConfigurationsService;
 beforeEach(()=>{
  db={siteSettings:{findUnique:jest.fn<any>().mockResolvedValue({catalogs:{componentModels:[]}})},registration:{findMany:jest.fn<any>().mockResolvedValue([]),findFirst:jest.fn<any>().mockResolvedValue({id:'reg',configurationVersion:{id:'original',configurationId:'config'},configurationConfirmation:null}),count:jest.fn<any>().mockResolvedValue(1)},
   carConfiguration:{findUnique:jest.fn<any>().mockResolvedValue({id:'config',carId:'car',currentVersion:3}),findUniqueOrThrow:jest.fn<any>().mockResolvedValue({id:'config',currentVersion:3}),findFirst:jest.fn<any>().mockResolvedValue(null),update:jest.fn<any>().mockResolvedValue({})},
   carConfigurationVersion:{create:jest.fn<any>().mockResolvedValue({id:'confirmed',version:4}),findUnique:jest.fn<any>().mockResolvedValue({id:'original'}),update:jest.fn()},
   historicalConfigurationConfirmation:{create:jest.fn<any>().mockResolvedValue({versionId:'confirmed',registrationId:'reg'}),count:jest.fn<any>().mockResolvedValue(0)},
   car:{findUnique:jest.fn<any>().mockResolvedValue({id:'car',participantId:'person'})},participant:{findFirst:jest.fn<any>().mockResolvedValue({id:'person'})},
   carAmplifierComponent:{deleteMany:jest.fn()},carHeadUnit:{deleteMany:jest.fn()},carAudioComponent:{deleteMany:jest.fn()},carAmplifier:{deleteMany:jest.fn()},carBattery:{deleteMany:jest.fn()},carGenerator:{deleteMany:jest.fn()}};
  db.$transaction=jest.fn(async(fn:any)=>fn(db));service=new ConfigurationsService(db);
 });
 it('only offers owner cars with actual imported results at the 2026 final',async()=>{
  await service.final2026Configurations(request);
  expect(db.registration.findMany.mock.calls[0][0].where).toMatchObject({source:'IMPORT',participant:{user:{id:'owner'}},car:{participant:{user:{id:'owner'}}},stage:{season:{year:2026},stageNumber:12,isDeleted:false},results:{some:{isHistorical:true}},configurationSnapshot:{path:['legacyImport'],equals:true}});
 });
 it('refuses anonymous requests',async()=>{await expect(service.final2026Configurations({})).rejects.toThrow(ForbiddenException);await expect(service.confirmFinal2026Configuration({},'reg',dto)).rejects.toThrow(ForbiddenException)});
 it('refuses another participant or a non-final registration before writing',async()=>{db.registration.findFirst.mockResolvedValue(null);await expect(service.confirmFinal2026Configuration(request,'other',dto)).rejects.toThrow(NotFoundException);expect(db.carConfigurationVersion.create).not.toHaveBeenCalled()});
 it('saves a separately attributed version and leaves original snapshots and equipment intact',async()=>{
  await service.confirmFinal2026Configuration(request,'reg',dto);
  expect(db.carConfigurationVersion.create).toHaveBeenCalledWith({data:{configurationId:'config',version:4,vibrationIsolation:'ComfortMat',additionalDescription:'Сборка на финале'}});
  expect(db.historicalConfigurationConfirmation.create).toHaveBeenCalledWith({data:{registrationId:'reg',versionId:'confirmed',confirmedByUserId:'owner'}});
  expect(db.carConfigurationVersion.update).not.toHaveBeenCalled();expect(db.carHeadUnit.deleteMany).not.toHaveBeenCalled();
 });
 it('does not duplicate confirmation on retry or next login',async()=>{db.registration.findFirst.mockResolvedValue({configurationConfirmation:{versionId:'confirmed'}});expect(await service.confirmFinal2026Configuration(request,'reg',dto)).toEqual({versionId:'confirmed'});expect(db.carConfigurationVersion.create).not.toHaveBeenCalled()});
 it.each(['registration','confirmation'])('preserves versions referenced by a %s during ordinary edits',async kind=>{
  db.registration.count.mockResolvedValue(kind==='registration'?1:0);db.historicalConfigurationConfirmation.count.mockResolvedValue(kind==='confirmation'?1:0);
  await service.update(request,'config',dto);expect(db.carConfigurationVersion.create).toHaveBeenCalled();expect(db.carConfigurationVersion.update).not.toHaveBeenCalled();expect(db.carHeadUnit.deleteMany).not.toHaveBeenCalled();
 });
 it('preserves even unreferenced working versions on edit',async()=>{db.registration.count.mockResolvedValue(0);await service.update(request,'config',dto);expect(db.carConfigurationVersion.create).toHaveBeenCalled();expect(db.carConfigurationVersion.update).not.toHaveBeenCalled();expect(db.carHeadUnit.deleteMany).not.toHaveBeenCalled()});
});
