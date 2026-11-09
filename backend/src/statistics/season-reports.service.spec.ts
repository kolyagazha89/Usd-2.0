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
});
