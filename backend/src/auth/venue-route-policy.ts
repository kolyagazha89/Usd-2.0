/** Permanent boundary for the LAN judge server. UI filtering alone is not RBAC.
 * The central Ubuntu instance does NOT set USD_VENUE_LAN_MODE.
 * Reads used by the competition day are allowed; writes are restricted
 * to the stage operation controllers. Never permit account/role management.
 */
const EVENTS=new Set([
 'RegistrationsController','InspectionsController','ResultsController',
 'ParticipantsController','CarsController','ConfigurationsController',
 'DisqualificationsController',
]);
const NO_LAN=new Set([
 'GoogleController','AssistantController','ImportsController',
 'AdminDeletionController','HistoricalResultsController','NormalizationDryRunController',
 'PushAdminController','AdminNotificationsController','MailController',
]);
const AUTH_WRITES=new Set(['/auth/login','/auth/refresh','/auth/logout']);
export function isVenueApiAllowed(controller:string,method:string,pathname:string):boolean{
 const path=pathname.toLowerCase().replace(/\/+$/,'')||'/';
 const action=method.toUpperCase();
 if(!path.startsWith('/')||path.includes('..')||/%(?:2f|5c|2e)/i.test(path))return false;
 if(NO_LAN.has(controller))return false;
 if(controller==='AuthController'){
  if(path.startsWith('/auth/admin/'))return false;
  return action==='GET'||action==='HEAD'?path==='/auth/me'||path==='/auth/build-info'
   :action==='POST'&&AUTH_WRITES.has(path);
 }
 if(controller==='StagesController'){
  if(action!=='GET'&&action!=='HEAD')return false;
  return path==='/stages'||path==='/stages/public'
   ||/^\/stages\/public\/[0-9a-f-]{36}$/.test(path)
   ||/^\/stages\/[0-9a-f-]{36}$/.test(path);
 }
 if(EVENTS.has(controller))return true;
 if(['GET','HEAD'].includes(action)){
  // Supporting read-only services (classes, catalogs, the event report,
  // approved legal policies and spectator endpoints) cannot change data.
  return true;
 }
 return false;
}
