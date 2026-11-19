/** Permanent boundary for the LAN judge server. UI filtering alone is not RBAC.
 * The central Ubuntu instance does NOT set USD_VENUE_LAN_MODE.
 * Reads used by the competition day are allowed; writes are restricted
 * to the stage operation controllers. Never permit account/role management.
 */
const EVENTS=new Set([
 'RegistrationsController','InspectionsController','ResultsController',
 'ParticipantsController','CarsController','ConfigurationsController',
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
 // The LAN export journal records disciplinary operations, but the central
 // full-return adapter cannot apply Disqualification rows yet. Fail closed:
 // accepting a local POST/PATCH would make the entire stage return impossible.
 if(controller==='DisqualificationsController')
  return action==='GET'||action==='HEAD';
 // A standalone participant/car creation can outlive the stage registration
 // graph, and a destructive DELETE or publication-consent change cannot be
 // imported by the signed venue-return adapter. Only stage-linked operations
 // (including the on-site registration's atomic profile/car creation) remain.
 if(controller==='ParticipantsController'){
  if(action==='DELETE')return false;
  if(action==='PATCH'&&path.startsWith('/participants/me'))return false;
  if(action==='POST'&&(
   path==='/participants'||path==='/participants/me'
   ||path==='/participants/me/cars'||path==='/participants/me/usd-id/rotate'
   ||/^\/participants\/[^/]+\/cars$/.test(path)
  ))return false;
 }
 if(controller==='ConfigurationsController'){
  if(action==='DELETE')return false;
  if(action==='POST'&&path.startsWith('/configurations/me/final-2026/'))return false;
 }
 if(controller==='ResultsController'&&action==='POST'&&path==='/results/admin/bassrace/commit')return false;

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
