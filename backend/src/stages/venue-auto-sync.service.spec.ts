import {describe,expect,it} from '@jest/globals';
import {databaseRegistrationConflict} from './venue-auto-sync.service';

describe('venue return database registration conflicts',()=>{
 it.each([
  ['Registration_stageId_participantNumber_key','START_NUMBER_TAKEN'],
  ['RegistrationNumber_stageId_number_key','START_NUMBER_TAKEN'],
  ['Registration_stageId_carId_key','CAR_REGISTRATION_EXISTS'],
  ['Participant_legacyId_key',undefined],
 ])('classifies a unique violation on %s', (constraint,expected)=>{
  const error=Object.assign(new Error('duplicate value'),{code:'23505',constraint});
  expect(databaseRegistrationConflict(error)).toBe(expected);
 });

 it('keeps foreign-key and connection failures separate from registration collisions',()=>{
  const error=Object.assign(new Error('database error'),{
   code:'23503',constraint:'Registration_stageId_carId_key',
  });
  expect(databaseRegistrationConflict(error)).toBeUndefined();
  expect(databaseRegistrationConflict(new Error('connect failed'))).toBeUndefined();
 });
});
