import {validateSync} from 'class-validator';
import {CreateStageDto,UpdateStageDto} from './dto/stage.dto';

describe('USD stage start time in Moscow',()=>{
 it.each(['00:00','09:30','10:00','23:59'])('accepts valid 24-hour start %s',value=>{
  const dto=Object.assign(new CreateStageDto(),{stageNumber:1,name:'USD',date:'2026-11-28T12:00:00Z',startTimeMsk:value});
  expect(validateSync(dto).filter(error=>error.property==='startTimeMsk')).toHaveLength(0);
 });
 it.each(['24:00','25:59','10:60','3:00','10:00Z','10:00+03:00',''])('rejects invalid Moscow start %s',value=>{
  const dto=Object.assign(new UpdateStageDto(),{startTimeMsk:value});
  expect(validateSync(dto).some(error=>error.property==='startTimeMsk')).toBe(true);
 });
 it('does not require explicitly setting the default on every API update',()=>{
  expect(validateSync(new UpdateStageDto()).filter(error=>error.property==='startTimeMsk')).toHaveLength(0);
 });
});
