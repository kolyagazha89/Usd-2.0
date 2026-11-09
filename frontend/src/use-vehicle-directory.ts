import {useEffect,useState,useSyncExternalStore} from 'react';
import {modelsForVehicleMake,parseVehicleDirectoryCsv,type VehicleDirectory} from './vehicle-directory';
import {getPublicSiteSettings} from './api';
import {availableVehicleDirectory} from './admin/vehicle-catalog-management';
import {createRefreshableDirectoryCache} from './vehicle-directory-cache';

async function fetchDirectory():Promise<VehicleDirectory>{
 const [response,publicSettings]=await Promise.all([
  fetch('/catalogs/usd_cars.csv',{credentials:'omit',cache:'force-cache'}),
  // User input must remain available even if the API temporarily goes offline.
  getPublicSiteSettings().catch(()=>null),
 ]);
 if(!response.ok)throw new Error('Справочник автомобилей временно недоступен');
 const seed=parseVehicleDirectoryCsv(await response.text());
 return availableVehicleDirectory(seed,publicSettings?.settings?.catalogs?.vehicleDirectory);
}
const directoryCache=createRefreshableDirectoryCache(fetchDirectory);

/** Call after a successful ADMIN settings save. In-flight old reads are ignored. */
export function invalidateVehicleDirectoryCache(){
 directoryCache.invalidate();
}

/** Suggestions never block typing, inspection, registration or saved historic cars. */
export function useVehicleDirectory(){
 const directory=useSyncExternalStore(directoryCache.subscribe,directoryCache.getSnapshot,directoryCache.getSnapshot);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(directory!==null)return;
  let active=true;
  void directoryCache.load().then(()=>{
   if(active)setError('');
  }).catch(reason=>{
   if(active)setError(reason instanceof Error?reason.message:'Не удалось загрузить справочник автомобилей');
  });
  return()=>{active=false};
 },[directory]);
 return {
  makes:directory?.makes??[],
  modelsFor:(make:string)=>modelsForVehicleMake(directory,make),
  loaded:directory!==null,
  error,
 };
}
