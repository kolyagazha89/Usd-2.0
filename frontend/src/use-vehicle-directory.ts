import {useEffect,useState} from 'react';
import {modelsForVehicleMake,parseVehicleDirectoryCsv,type VehicleDirectory} from './vehicle-directory';
import {getPublicSiteSettings} from './api';
import {availableVehicleDirectory} from './admin/vehicle-catalog-management';

let cachedDirectory:VehicleDirectory|null=null;
let loading:Promise<VehicleDirectory>|null=null;

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
/** Suggestions never block typing, inspection, registration or saved historic cars. */
export function useVehicleDirectory(){
 const [directory,setDirectory]=useState<VehicleDirectory|null>(cachedDirectory);
 useEffect(()=>{
  let active=true;
  if(cachedDirectory){setDirectory(cachedDirectory);return()=>{active=false}}
  if(!loading){
   loading=fetchDirectory().then(data=>{cachedDirectory=data;return data}).catch(error=>{
    loading=null;throw error;
   });
  }
  void loading.then(data=>{if(active)setDirectory(data)}).catch(()=>{});
  return()=>{active=false};
 },[]);
 return {
  makes:directory?.makes??[],
  modelsFor:(make:string)=>modelsForVehicleMake(directory,make),
  loaded:directory!==null,
 };
}
