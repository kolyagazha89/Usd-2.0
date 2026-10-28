import {jest} from '@jest/globals';
import {ConfigurationsService} from './configurations.service';

describe('configuration equipment revision history',()=>{
 const request={user:{sub:'owner',role:'ADMIN'}};
 const dto={name:'Сборка для SPL',vibrationIsolation:'STP',additionalDescription:'Новая настройка',headUnits:[],audioComponents:[],amplifiers:[],batteries:[],generators:[]};
 let db:any;
 let service:ConfigurationsService;
 beforeEach(()=>{
  db={
   siteSettings:{findUnique:jest.fn<any>().mockResolvedValue({catalogs:{componentModels:[{id:'00000000-0000-4000-8000-000000000001',category:'SUBWOOFER',brand:'Deaf Bonce',model:'Test',isActive:true}]}})},
   car:{findUnique:jest.fn<any>().mockResolvedValue({id:'car',participantId:'person'})},
   carConfiguration:{
    findUnique:jest.fn<any>().mockResolvedValue({id:'config',carId:'car',currentVersion:1}),
    findFirst:jest.fn<any>().mockResolvedValue(null),
    update:jest.fn<any>().mockResolvedValue({}),
   },
   carConfigurationVersion:{
    findUnique:jest.fn<any>().mockResolvedValue({id:'v1',version:1}),
    create:jest.fn<any>().mockResolvedValue({id:'v2',version:2}),
    update:jest.fn<any>(),
   },
   carHeadUnit:{deleteMany:jest.fn<any>()},
   carAudioComponent:{deleteMany:jest.fn<any>(),create:jest.fn<any>()},
   carAmplifier:{deleteMany:jest.fn<any>()},
   carAmplifierComponent:{deleteMany:jest.fn<any>()},
   carBattery:{deleteMany:jest.fn<any>()},
   carGenerator:{deleteMany:jest.fn<any>()},
  };
  db.$transaction=jest.fn<any>(async(fn:any)=>fn(db));
  service=new ConfigurationsService(db);
 });
 it('always creates a new immutable version and advances the current pointer, even before registration',async()=>{
  await service.update(request,'config',dto);
  expect(db.carConfigurationVersion.create).toHaveBeenCalledWith({data:{
   configurationId:'config',version:2,vibrationIsolation:'STP',additionalDescription:'Новая настройка',
  }});
  expect(db.carConfiguration.update).toHaveBeenCalledWith({
   where:{id:'config'},data:{name:'Сборка для SPL',currentVersion:2},
  });
  for(const name of ['carHeadUnit','carAudioComponent','carAmplifier','carAmplifierComponent','carBattery','carGenerator']){
   expect(db[name].deleteMany).not.toHaveBeenCalled();
  }
  expect(db.carConfigurationVersion.update).not.toHaveBeenCalled();
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'Serializable'});
 });
 it('does not advance the pointer if saving the new equipment fails',async()=>{
  db.carAudioComponent.create.mockRejectedValue(new Error('Failed to save component'));
  const changed={...dto,audioComponents:[{catalogEntryId:'00000000-0000-4000-8000-000000000001',brand:'Deaf Bonce',model:'Test',quantity:1,type:'SUBWOOFER',direction:'SUB'}]};
  await expect(service.update(request,'config',changed as any)).rejects.toThrow('Failed to save component');
  expect(db.carConfiguration.update).not.toHaveBeenCalled();
  expect(db.carConfigurationVersion.update).not.toHaveBeenCalled();
 });
});
