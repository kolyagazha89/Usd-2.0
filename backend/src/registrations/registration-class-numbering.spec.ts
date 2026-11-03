import {isBassRaceStageClass,planRegistrationClassNumbers,MAX_CLASSES_ON_PRIMARY_NUMBER,MAX_REGISTRATION_CLASS_IDS} from './registration-class-numbering';

const row=(classId:string,name:string,directionName:string)=>({classId,class:{name,direction:{name:directionName}}});
describe('USD primary number / BassRace allocation',()=>{
 it('uses at most five classes on a primary number, without a five-class registration limit',()=>{
  const stage=[row('spl','Limited 2.0','SPL'),row('front','Gate 1-6','BFSPL'),
   ...['129.9','139.9','149.9','159.9','169.9'].map((name,i)=>row('b'+i,'BassRace '+name,'BassRace'))];
  const ids=stage.map(s=>s.classId);
  const plan=planRegistrationClassNumbers(ids,stage);
  expect(ids).toHaveLength(7);
  expect(plan.primaryClassCount).toBe(3);
  expect(plan.requiredNumberCount).toBe(5);
  expect(plan.bassOnPrimaryId).toBe('b0');
  expect(plan.bassRaceClassIds).toHaveLength(5);
 });
 it('keeps the primary sticker at five while ALL BassRace entries receive independent numbers',()=>{
  const stage=[...Array.from({length:5},(_,i)=>row('r'+i,'Stage '+i,'direction-'+i)),
   ...Array.from({length:7},(_,i)=>row('b'+i,'BassRace '+i,'BassRace'))];
  const plan=planRegistrationClassNumbers(stage.map(x=>x.classId),stage);
  expect(plan.primaryClassCount).toBe(5);
  expect(plan.requiredNumberCount).toBe(8);
  expect(plan.bassOnPrimaryId).toBeNull();
 });
 it('rejects six regular classes even when BassRace classes also exist',()=>{
  const stage=Array.from({length:6},(_,i)=>row('r'+i,'SPL '+i,'SPL '+i));
  expect(()=>planRegistrationClassNumbers(stage.map(x=>x.classId),stage)).toThrow('не более 5');
 });
 it('normalizes spaced or imported Bass Race direction names and rejects missing stage classes',()=>{
  expect(isBassRaceStageClass('129.9','Bass Race')).toBe(true);
  expect(isBassRaceStageClass('Bass-Race 139.9','SPL')).toBe(true);
  expect(isBassRaceStageClass('Limited 2.0','SPL')).toBe(false);
  expect(()=>planRegistrationClassNumbers(['missing'],[])).toThrow('Недоступный класс');
  expect(MAX_CLASSES_ON_PRIMARY_NUMBER).toBe(5);
  expect(MAX_REGISTRATION_CLASS_IDS).toBeGreaterThan(5);
 });
});
