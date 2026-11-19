import {isVenueApiAllowed} from './venue-route-policy';

describe('venue API is a subset of production administration',()=>{
 it('keeps complete competition operations and LIVE',()=>{
  for(const [controller,method,path] of [
   ['RegistrationsController','POST','/registrations'],
   ['InspectionsController','PATCH','/inspections/uuid'],
   ['ResultsController','POST','/results'],
   ['ResultsController','GET','/results/venue-live'],
   ['ParticipantsController','POST','/participants'],
   ['CarsController','PATCH','/cars/uuid'],
   ['ConfigurationsController','POST','/configurations'],
   ['DisqualificationsController','GET','/disqualifications'],
   ['StagesController','GET','/stages'],
   ['SiteSettingsController','GET','/site-settings/public'],
   ['AuthController','POST','/auth/login'],
   ['AuthController','POST','/auth/refresh'],
   ['AuthController','POST','/auth/logout'],
   ['AuthController','GET','/auth/me'],
   ['AppController','GET','/release'],
  ] as const)expect(isVenueApiAllowed(controller,method,path)).toBe(true);
 });
 it('blocks offline disqualification writes until the signed return can import them',()=>{
  // Disqualification has no row adapter in full-return-apply.mjs. Otherwise a
  // local POST/PATCH can poison the journal and block all result imports.
  expect(isVenueApiAllowed('DisqualificationsController','GET','/disqualifications')).toBe(true);
  expect(isVenueApiAllowed('DisqualificationsController','POST','/disqualifications')).toBe(false);
  expect(isVenueApiAllowed('DisqualificationsController','PATCH','/disqualifications/uuid/revoke')).toBe(false);
 });
 it('rejects global edits, user administration, mail, pub server syncing and signup',()=>{
  for(const [controller,method,path] of [
   ['AuthController','POST','/auth/register'],
   ['AuthController','POST','/auth/admin/users'],
   ['AuthController','PATCH','/auth/admin/users/xyz/role'],
   ['StagesController','POST','/stages'],
   ['StagesController','POST','/stages/venue/sync'],
   ['StagesController','POST','/stages/id/results-publication'],
   ['StagesController','POST','/stages/id/staff-export'],
   ['SiteSettingsController','PATCH','/site-settings'],
   ['MediaController','POST','/media/prepare'],
   ['GoogleController','POST','/google/connect'],
   ['ImportsController','POST','/imports/historical/commit'],
   ['AssistantController','POST','/assistant/functions'],
   ['TeamsController','POST','/teams/admin'],
   ['AdminDeletionController','DELETE','/admin/permanent-deletion'],
  ] as const)expect(isVenueApiAllowed(controller,method,path)).toBe(false);
 });
});
