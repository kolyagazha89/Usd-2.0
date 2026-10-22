import {useEffect,useState} from 'react';
import {getPublicSiteSettings} from '../api';
import type {PhotoPlaceholders} from './PremiumUI';

/** Public settings expose non-sensitive fallback artwork to member screens. */
export function usePhotoPlaceholders(){
 const [placeholders,setPlaceholders]=useState<PhotoPlaceholders>({});
 useEffect(()=>{
  let mounted=true;
  getPublicSiteSettings().then(response=>{
   if(mounted)setPlaceholders(response?.settings?.branding?.placeholders??{});
  }).catch(()=>{});
  return ()=>{mounted=false};
 },[]);
 return placeholders;
}
