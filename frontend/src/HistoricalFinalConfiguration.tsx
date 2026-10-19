import {useEffect,useState} from 'react';
import {apiGet,apiPost} from './api';
import {ConfigurationEditor} from './admin/ConfigurationsPage';

export default function HistoricalFinalConfiguration(){
 const[items,setItems]=useState<any[]>([]),[editing,setEditing]=useState<any>(null),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const load=async()=>{try{const r=await apiGet<any>('/configurations/me/final-2026');setItems(r.items??[]);setError('')}catch(e){setError(e instanceof Error?e.message:'Не удалось проверить конфигурации финала')}};
 useEffect(()=>{let active=true;apiGet<any>('/configurations/me/final-2026').then(r=>{if(active)setItems(r.items??[])}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось проверить конфигурации финала')});return()=>{active=false}},[]);
 const pending=items.filter(item=>!item.confirmedAt);
 if(editing)return <section className="participant-section"><ConfigurationEditor key={editing.registrationId} carId={editing.car.id} configuration={editing.configuration} admin={false} historicalFinal onClose={()=>setEditing(null)} saveOverride={async body=>{await apiPost('/configurations/me/final-2026/'+encodeURIComponent(editing.registrationId)+'/confirm',body)}} onSaved={async()=>{setEditing(null);setSaved(true);await load()}}/></section>;
 if(!pending.length&&!error&&!saved)return null;
 return <section className="participant-section" aria-label="Конфигурация финала 2026">
  <div className="participant-section-head"><div><span className="eyebrow">ВАША ИСТОРИЯ USD</span><h2>{pending.length?'Уточните конфигурацию финала 2026':'Конфигурация финала подтверждена'}</h2></div></div>
  {saved&&<p role="status">Сохранили вашу версию. Исходная конфигурация и результаты выступлений сохранены.</p>}
  {error&&<div role="alert" className="form-error">{error}<button className="secondary-button compact" onClick={()=>void load()}>Повторить</button></div>}
  {pending.length>0&&<p>Мы нашли ваше выступление на финале в Волгограде 12 сентября 2026. Проверьте виброизоляцию и добавьте оборудование, которое стояло в машине в тот день.</p>}
  <div className="participant-stage-list">{pending.map(item=><article key={item.registrationId}><div><strong>{[item.car.brand,item.car.model].filter(Boolean).join(' ')}</strong><span>{item.car.registrationNumber?.startsWith('IMPORT-')?'Автомобиль из архива':item.car.registrationNumber} · {item.stageName}</span></div><button className="primary-button compact" onClick={()=>setEditing(item)}>Проверить и дополнить</button></article>)}</div>
 </section>;
}
