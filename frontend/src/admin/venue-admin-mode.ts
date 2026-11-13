/** The LAN hub runs the same USD admin app with ONLY the event-day workspace.
 * Source of truth is the locally bootstrapped server, not navigator.onLine:
 * browsers may report "online" on a Wi-Fi router with no WAN connection.
 */
export const VENUE_ADMIN_HOME='/admin/event-day';
const MENU_PATHS=new Set([
 VENUE_ADMIN_HOME,'/admin/registrations','/admin/inspections',
 '/admin/results','/admin/participants','/admin/cars',
]);
const WORKSPACE_ROOTS=[...MENU_PATHS];
const STAGE_DETAIL=/^\/admin\/stages\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function routeOnly(value:string):string{
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')
  ||value.includes('\\')||/%(?:2f|5c|2e)/i.test(value))return '';
 const route=value.split(/[?#]/,1)[0];
 if(route.split('/').some(part=>part==='.'||part==='..'))return '';
 return route.replace(/\/$/,'')||'/';
}
export function venueAdminRouteAllowed(path:string):boolean{
 const route=routeOnly(path);
 return WORKSPACE_ROOTS.some(root=>route===root||route.startsWith(root+'/'))
  ||STAGE_DETAIL.test(route);
}
export function venueAdminMenuAllowed(path:string,mode:unknown):boolean{
 return mode!==true||MENU_PATHS.has(routeOnly(path));
}
/** Same UI and URLs on the laptop, but blocked modules cannot be reopened
 * by a pasted deep link or browser history entry.
 */
export function venueEntryPath(path:string,mode:unknown):string{
 if(mode!==true)return path;
 const route=routeOnly(path);
 if(route==='/login'||route==='/venue/live'||venueAdminRouteAllowed(path))
  return path;
 return VENUE_ADMIN_HOME;
}
