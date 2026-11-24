import {describe,expect,it} from '@jest/globals';
import {databaseRegistrationConflict,databaseWriteFailure,retryVenueTransaction} from './venue-auto-sync.service';

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

describe('venue return write failures',()=>{
 it.each([
  ['42P01','RETURN_DB_SCHEMA'],['RETURN_SCHEMA_MISMATCH','RETURN_DB_SCHEMA'],
  ['42501','RETURN_DB_PERMISSIONS'],['23514','RETURN_ROW_INVALID'],
  ['57014','RETURN_DB_BUSY'],['ECONNRESET','RETURN_WRITE_FAILED'],
 ])('maps a database error %s without returning the SQL text', (code,expected)=>{
  expect(databaseWriteFailure(Object.assign(new Error('private SQL detail'),{code}))).toBe(expected);
 });

 it('retries an aborted serialization transaction but does not repeat permanent failures',async()=>{
  let attempts=0;
  const status=await retryVenueTransaction(async()=>{
   if(++attempts===1)throw Object.assign(new Error('serialization failure'),{code:'40001'});
   return 'accepted';
  });
  expect(status).toBe('accepted');
  expect(attempts).toBe(2);
  await expect(retryVenueTransaction(async()=>{
   attempts++;
   throw Object.assign(new Error('foreign key failure'),{code:'23503'});
  })).rejects.toMatchObject({code:'23503'});
  expect(attempts).toBe(3);
 });
});
