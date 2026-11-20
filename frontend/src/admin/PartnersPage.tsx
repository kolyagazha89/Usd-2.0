import {AdminListPagination} from './AdminListPagination';
import {paginateResourceRows} from './admin-table-model';
import CollapsibleFilters from '../CollapsibleFilters';
import {useEditorScroll} from './view-state';
import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,ChevronLeft,Loader2,Pencil,Plus} from 'lucide-react';
import {filterPartners,type PartnerVisibilityFilter} from './admin-communications-utils';
import './partner-workbench.css';
import {getSiteSettings,updateSiteSettings,uploadSiteAsset} from '../api';
import {validateImageUpload} from './upload-validation';
import PartnerImageEditor from './PartnerImageEditor';
import {DEFAULT_PARTNER_IMAGE_LAYOUT} from '../public/partner-image-layout';

const tierRank=(tier:string)=>tier==='GENERAL'?0:tier==='PREMIUM'?1:tier==='REGULAR'?2:tier==='STUDIO'?3:4;
const sortPartnerRows=(rows:any[])=>[...rows].sort((a:any,b:any)=>tierRank(a.tier)-tierRank(b.tier)||(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0)||String(a.name??'').localeCompare(String(b.name??''),'ru'));
function PartnersPage({PageFrame,ErrorPanel,LoadingPage,Empty}: {PageFrame:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>}){
 const[query,setQuery]=useState(''),[tierFilter,setTierFilter]=useState('all'),[visibilityFilter,setVisibilityFilter]=useState<PartnerVisibilityFilter>('all');
 const[partners,setPartners]=useState<any[]>([]),[partnersRevision,setPartnersRevision]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[modal,setModal]=useState<any|null>(null),[modalError,setModalError]=useState(''),[confirmHideId,setConfirmHideId]=useState('');
 useEditorScroll('partners',modal!==null,!loading);
 const load=async()=>{
  setLoading(true);setError('');
  try{
   const response=await getSiteSettings();
   setPartners(sortPartnerRows(Array.isArray(response?.settings?.partners)?response.settings.partners:[]));
   setPartnersRevision(String(response?.settings?._partnersRevision??''));
  }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить партнёров')}
  finally{setLoading(false)}
 };
 useEffect(()=>{void load()},[]);
 // The mutation response already contains the authoritative partners and new
 // concurrency revision. Never rely on a second GET after a committed write.
 const applyCommittedPartners=(response:any,fallback:any[])=>{
  setPartners(sortPartnerRows(Array.isArray(response?.settings?.partners)?response.settings.partners:fallback));
  setPartnersRevision(String(response?.settings?._partnersRevision??partnersRevision));
  setError('');
 };
 const save=async(v:any)=>{
  if(saving)return;
  setSaving(true);setModalError('');
  try{
   const response=await getSiteSettings();
   const current=Array.isArray(response?.settings?.partners)?response.settings.partners:[];
   let item={...(modal?.id?modal:{}),id:modal?.id??crypto.randomUUID(),name:String(v.name??'').trim(),
    description:String(v.description??'').trim(),tier:v.tier||'REGULAR',website:String(v.website??'').trim(),
    isActive:v.isActive!==false,isPublished:v.isPublished!==false,sortOrder:Number(v.sortOrder??0),
    photoUrl:modal?.photoUrl??null,imageLayout:v.imageLayout};
   if(v.file instanceof File){
    const validationError=validateImageUpload(v.file);
    if(validationError)throw new Error(validationError);
    const uploaded=await uploadSiteAsset('partner-'+item.id,v.file);
    item.photoUrl=uploaded.publicPath;
   }
   const next=modal?.id?current.map((x:any)=>x.id===item.id?item:x):[...current,item];
   const committed=await updateSiteSettings({_partnersRevision:partnersRevision,partners:next});
   applyCommittedPartners(committed,next);
   setModal(null);
  }catch(e){setModalError(e instanceof Error?e.message:'Не удалось сохранить партнёра')}
  finally{setSaving(false)}
 };
 const remove=async(id:string)=>{
  if(saving)return;
  setSaving(true);setError('');
  try{
   const response=await getSiteSettings();
   const current=Array.isArray(response?.settings?.partners)?response.settings.partners:[];
   const next=current.map((x:any)=>x.id===id?{...x,isActive:false}:x);
   const committed=await updateSiteSettings({_partnersRevision:partnersRevision,partners:next});
   applyCommittedPartners(committed,next);
   setConfirmHideId('');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось изменить статус')}
  finally{setSaving(false)}
 };
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 useEffect(()=>setPage(1),[query,tierFilter,visibilityFilter]);
 const visiblePartners=filterPartners(partners,query,tierFilter,visibilityFilter);
 const pagination=paginateResourceRows(visiblePartners,page,pageSize);
 const tierName=(x:string)=>x==='GENERAL'?'Генеральный':x==='PREMIUM'?'Премиальный':x==='STUDIO'?'Студии-партнёры':'Обычный';
 return <PageFrame title="Партнёры" subtitle="Партнёры USD и размещение на публичном сайте" action={modal===null?<button className="primary-button compact" onClick={()=>{setModal({tier:'REGULAR',isActive:true,isPublished:false,sortOrder:0,imageLayout:{...DEFAULT_PARTNER_IMAGE_LAYOUT,aspectWidth:16,aspectHeight:9}});setModalError("")}}><Plus size={15}/>Добавить партнёра</button>:undefined}>{modal!==null ? <section className="panel resource-editor-page"><div className="resource-editor-heading"><div><span className="eyebrow">КОНТЕНТ САЙТА · ПАРТНЁРЫ</span><h2>{modal.id?'Редактирование партнёра':'Новый партнёр'}</h2><p>Генеральный партнёр получает отдельный крупный блок, премиальный — увеличенную карточку, обычный — место в сетке, а студии-партнёры выводятся отдельным разделом. Порядок внутри категории задаётся ниже.</p></div><button type="button" className="secondary-button" onClick={()=>{setModal(null);setModalError("")}}><ChevronLeft size={16}/>К списку</button></div>{modalError&&<div className="form-error" role="alert"><AlertTriangle size={16}/><span>{modalError}</span></div>}<PartnerForm value={modal} saving={saving} onSubmit={save}/></section> : <>
  {error&&<ErrorPanel message={error} retry={load}/>}
  <div className="panel partner-workbench" aria-label="Поиск и фильтры партнёров">
   <div className="partner-workbench-toolbar">
    <label>Поиск<input type="search" aria-label="Поиск партнёров" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название, описание или сайт" autoComplete="off"/></label>
    <CollapsibleFilters activeCount={Number(tierFilter!=='all')+Number(visibilityFilter!=='all')}><label>Категория<select aria-label="Категория партнёров" value={tierFilter} onChange={e=>setTierFilter(e.target.value)}><option value="all">Все категории</option><option value="GENERAL">Генеральные</option><option value="PREMIUM">Премиальные</option><option value="REGULAR">Обычные</option><option value="STUDIO">Студии-партнёры</option></select></label>
    <label>Статус<select aria-label="Видимость партнёров" value={visibilityFilter} onChange={e=>setVisibilityFilter(e.target.value as PartnerVisibilityFilter)}><option value="all">Все статусы</option><option value="visible">Опубликованы</option><option value="draft">Черновики</option><option value="hidden">Скрытые</option></select></label></CollapsibleFilters>
   </div>
   <div className="partner-workbench-footer"><span role="status">Показано {visiblePartners.length} из {partners.length}</span>{(query||tierFilter!=='all'||visibilityFilter!=='all')&&<button type="button" className="secondary-button compact" onClick={()=>{setQuery('');setTierFilter('all');setVisibilityFilter('all')}}>Сбросить фильтры партнёров</button>}</div>
  </div>
  {visiblePartners.length>10&&<AdminListPagination label="партнёров" total={visiblePartners.length} page={pagination.page} pageCount={pagination.pageCount} pageSize={pagination.pageSize} onPageChange={setPage} onPageSizeChange={size=>{setPageSize(size);setPage(1)}}/>}
  <div className="panel table-wrap">{loading?<LoadingPage small/>:visiblePartners.length?<table className="data-table"><thead><tr><th>Партнёр</th><th>Уровень</th><th>Описание</th><th>Сайт</th><th>Статус</th><th/></tr></thead><tbody>{pagination.rows.map((p:any)=><tr key={p.id}><td data-label="Партнёр"><div className="admin-partner-identity">{p.photoUrl&&<img src={p.photoUrl} alt="" loading="lazy"/>}<strong>{p.name}</strong></div></td><td data-label="Уровень"><span className={'badge admin-partner-tier admin-partner-tier--'+String(p.tier??'REGULAR').toLowerCase()}>{tierName(p.tier)}</span></td><td data-label="Описание">{p.description||'—'}</td><td data-label="Сайт">{p.website||'—'}</td><td data-label="Статус"><span className={'badge '+(p.isActive&&p.isPublished!==false?'good':'')}>{!p.isActive?'Скрыт':p.isPublished===false?'Черновик':'Опубликован'}</span></td><td data-label="Действия" className="row-actions"><button type="button" className="icon-button partner-edit-action" aria-label={'Редактировать партнёра '+p.name} onClick={()=>{setModal(p);setModalError("")}} title="Изменить"><Pencil size={15}/></button>{p.isActive&&(confirmHideId===p.id?<span className="inline-confirm-actions"><span>Скрыть партнёра?</span><button className="danger-button compact" onClick={()=>void remove(p.id)}>Подтвердить</button><button className="secondary-button compact" onClick={()=>setConfirmHideId("")}>Отмена</button></span>:<button className="secondary-button compact" onClick={()=>setConfirmHideId(p.id)}>Скрыть</button>)}</td></tr>)}</tbody></table>:partners.length?<div className="partner-workbench-empty"><Empty text="Партнёры по выбранным фильтрам не найдены"/><button type="button" className="secondary-button compact" onClick={()=>{setQuery('');setTierFilter('all');setVisibilityFilter('all')}}>Показать всех партнёров</button></div>:<Empty text="Партнёров пока нет"/>}</div>
</>}</PageFrame>
}

function PartnerForm({value,saving,onSubmit}:{value:any;saving:boolean;onSubmit:(v:any)=>Promise<void>}){
 const[v,setV]=useState<any>({...value});
 const fileInput=useRef<HTMLInputElement>(null);
 const[imageValid,setImageValid]=useState(true),[fileError,setFileError]=useState('');
 return <form className="form modal-form" onSubmit={e=>{e.preventDefault();if(imageValid&&!fileError)void onSubmit(v)}}>
  <div className="form-grid-2"><label>Название<input maxLength={160} value={v.name??''} onChange={e=>setV({...v,name:e.target.value})} required/></label><label>Уровень<select value={v.tier??'REGULAR'} onChange={e=>setV({...v,tier:e.target.value})}><option value="GENERAL">Генеральный</option><option value="PREMIUM">Премиальный</option><option value="REGULAR">Обычный</option><option value="STUDIO">Студии-партнёры</option></select></label></div>
  <label>Описание<textarea maxLength={3000} value={v.description??''} onChange={e=>setV({...v,description:e.target.value})}/></label>
  <label>Сайт<input type="url" maxLength={2048} value={v.website??''} onChange={e=>setV({...v,website:e.target.value})} placeholder="https://"/></label>
  <div className="form-grid-2"><label>Порядок<input type="number" min={0} max={100000} step={1} value={v.sortOrder??0} onChange={e=>setV({...v,sortOrder:Number(e.target.value)})}/></label><label className="checkbox-row"><input type="checkbox" checked={v.isActive!==false} onChange={e=>setV({...v,isActive:e.target.checked})}/>Активен</label></div>
  <label className="checkbox-row"><input type="checkbox" checked={v.isPublished!==false} onChange={e=>setV({...v,isPublished:e.target.checked})}/>Опубликован на сайте</label>
  <p className="form-hint">Новый партнёр сохраняется как черновик. Для появления на сайте включите публикацию и активность. Ссылка должна начинаться с https:// или http://; изменения категории сразу меняют размещение на публичном сайте.</p>
  <label>Фото / логотип<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0]??null;const error=file?validateImageUpload(file):null;setFileError(error??'');setV({...v,file:error?null:file});if(error)e.currentTarget.value=''}}/></label>
  {fileError&&<p className="form-error" role="alert">{fileError}</p>}
  {(v.file||fileError)&&<button type="button" className="secondary-button compact" onClick={()=>{setV({...v,file:null});setFileError('');if(fileInput.current)fileInput.current.value=''}}>Отменить замену</button>}
  <PartnerImageEditor value={v.imageLayout} photoUrl={v.photoUrl} name={String(v.name??'')} description={String(v.description??'')} tier={v.tier} file={v.file} disabled={saving} onChange={imageLayout=>setV({...v,imageLayout})} onValidityChange={setImageValid}/>
  <button className="primary-button" disabled={saving||!imageValid||!!fileError}>{saving?<><Loader2 className="spin" size={15}/>Сохраняем…</>:'Сохранить партнёра'}</button>
 </form>
}


export default PartnersPage;
