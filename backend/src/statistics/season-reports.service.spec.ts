import {jest} from '@jest/globals';
import {BadRequestException} from '@nestjs/common';
import {SeasonReportsService} from './season-reports.service';

const ID='00000000-0000-4000-8000-000000000001';
describe('SeasonReportsService comparison safety',()=>{
 it('rejects a season compared with itself before any database reads',async()=>{
  const db:any={season:{findMany:jest.fn()},stage:{findMany:jest.fn()},registration:{findMany:jest.fn()},record:{findMany:jest.fn()}};
  const service=new SeasonReportsService(db);
  await expect(service.getReport(ID,ID)).rejects.toBeInstanceOf(BadRequestException);
  expect(db.season.findMany).not.toHaveBeenCalled();
  expect(db.stage.findMany).not.toHaveBeenCalled();
 });
 it('rejects invalid season keys before executing bulk report queries',async()=>{
  const db:any={season:{findMany:jest.fn()},stage:{findMany:jest.fn()},registration:{findMany:jest.fn()},record:{findMany:jest.fn()}};
  const service=new SeasonReportsService(db);
  await expect(service.getReport('invalid',undefined)).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.getReport(ID,'../invalid')).rejects.toBeInstanceOf(BadRequestException);
  expect(db.season.findMany).not.toHaveBeenCalled();
 });
 it('scopes large batch reads to the correct stage season without duplicate person counts',async()=>{
  const old='00000000-0000-4000-8000-000000000002';
  const stage=(sid:string,id:string)=>({id,seasonId:sid,stageNumber:1,name:id,status:'COMPLETED',date:new Date('2026-05-01')});
  const registration=(id:string,stageId:string,participantId:string)=>({
   id,stageId,participantId,status:'ACTIVE',participantNumber:2,
   teamIdAtInspection:null,teamNameAtInspection:null,
   participant:{createdAt:new Date('2020-01-01'),city:null,team:null},classes:[],
  });
  const db:any={
   season:{findMany:jest.fn()},stage:{findMany:jest.fn()},
   registration:{findMany:jest.fn()},record:{findMany:jest.fn()},
  };
  db.season.findMany.mockResolvedValue([
    {id:ID,name:'2026',year:2026},{id:old,name:'2025',year:2025},
  ]);
  db.stage.findMany.mockResolvedValue([stage(ID,'new-stage'),stage(old,'old-stage')]);
  db.registration.findMany.mockResolvedValue([
    registration('r1','new-stage','p1'),registration('r2','new-stage','p1'),
    registration('r3','old-stage','p2'),registration('r4','old-stage','p3'),
  ]);
  db.record.findMany.mockResolvedValue([]);
  const data:any=await new SeasonReportsService(db).getReport(ID,old);
  expect(data.report.totals).toMatchObject({registered:1,registrations:2,stages:1});
  expect(data.comparison.baseline.totals).toMatchObject({registered:2,registrations:2,stages:1});
  expect(data.report.stages.map((s:any)=>s.id)).toEqual(['new-stage']);
  expect(data.comparison.baseline.stages.map((s:any)=>s.id)).toEqual(['old-stage']);
  for(const key of ['season','stage','registration','record']){
   expect(db[key].findMany).toHaveBeenCalledTimes(1);
  }
 });
});
