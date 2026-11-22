import {apiGet,listData} from '../api';
import {markVenueStages,type CalendarStage} from './stage-calendar';

export async function loadOperationalStages<T extends CalendarStage>(endpoint:'/stages'|'/stages/public'='/stages'):Promise<T[]>{
 const venue=(window as Window&{__USD_VENUE_MODE__?:unknown}).__USD_VENUE_MODE__===true;
 const stages=apiGet(venue?'/stages/public':endpoint).then(value=>listData<T>(value).filter(stage=>stage?.id));
 if(!venue)return stages;
 // This endpoint works on already-installed LAN APIs. It reads the stage
 // bound to the running server, irrespective of the public signup window.
 const [items,live]=await Promise.all([stages,apiGet<{stage?:{id?:string}}>('/results/venue-live')]);
 return markVenueStages(items,live?.stage?.id??'');
}
