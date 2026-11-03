import {useEffect,useState} from 'react';
import {apiGet,apiPatch,listData} from '../api';
import {isUndocumentedEquipment} from './pending-equipment-policy';

/** Completing an event-day draft is a later documentary addendum. */
export default function PendingEquipment({registration,onFinished,onGo}:{registration:any;onFinished:()=>Promise<void>;onGo:(path:string)=>void}){
 const pending=registration.status==='ACTIVE' && isUndocumentedEquipment(registration.configurationSnapshot);
 const [options,setOptions]=useState<Array<{id:string;name:string}>>([]);
 const [versionId,setVersionId]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const carId=String(registration.carId??registration.car?.id??'');
 useEffect(()=>{
  if(!pending||!carId)return;
  let active=true;setLoading(true);
  apiGet<any>('/cars/'+encodeURIComponent(carId)+'/configurations').then(response=>{
   if(!active)return;
   const found=listData<any>(response).flatMap((config:any)=>(config.versions??[])
    .filter((version:any)=>version.additionalDescription!=='USD_ON_SITE_DRAFT_PENDING')
    .map((version:any)=>({id:String(version.id),name:String(config.name||'Аудиосистема')+' · версия '+version.version})));
   setOptions(found);setVersionId('');
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось загрузить конфигурации')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[pending,carId]);
 if(!pending)return null;
 const confirm=async()=>{
  if(!versionId||busy)return;
  setBusy(true);setError('');
  try{await apiPatch('/registrations/'+encodeURIComponent(registration.id)+'/configuration',{configurationVersionId:versionId});await onFinished()}
  catch(e){setError(e instanceof Error?e.message:'Не удалось подтвердить конфигурацию')}
  finally{setBusy(false)}
 };
 return <section className="pending-equipment-card" aria-label="Требуется заполнить конфигурацию автомобиля">
  <strong>Оборудование после этапа не заполнено</strong>
  <p>Результат и номер сохранены. Перед следующей регистрацией заполните аудиосистему автомобиля и подтвердите её. Данные дня соревнований останутся неизменными.</p>
  <div className="pending-equipment-actions">
   <button type="button" className="secondary-button compact" onClick={()=>onGo('/participant/configurations?carId='+encodeURIComponent(carId))}>Заполнить аудиосистему</button>
   <label>Сохранённая версия
    <select value={versionId} disabled={busy||loading} onChange={e=>setVersionId(e.target.value)}>
     <option value="">{loading?'Загрузка…':'Выберите конфигурацию'}</option>
     {options.map(option=><option value={option.id} key={option.id}>{option.name}</option>)}
    </select>
   </label>
   <button className="primary-button compact" disabled={!versionId||loading||busy} onClick={()=>void confirm()}>{busy?'Подтверждение…':'Подтвердить заполнение'}</button>
  </div>
  {options.length===0&&!loading&&<small>После сохранения оборудования вернитесь на вкладку «Регистрации» и обновите список.</small>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </section>;
}
