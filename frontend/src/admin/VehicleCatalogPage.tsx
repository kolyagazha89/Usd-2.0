import {useCallback,useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CheckCircle2,CarFront,Pencil,Plus,RefreshCw,Search,Trash2,Upload} from 'lucide-react';
import {getSiteSettings,updateSiteSettings} from '../api';
import {parseVehicleDirectoryCsv,type VehicleDirectory} from '../vehicle-directory';
import {invalidateVehicleDirectoryCache} from '../use-vehicle-directory';
import {addVehicleBrand,addVehicleModel,archiveVehicleBrand,archiveVehicleModel,countDisabledVehicles,emptyVehicleOverrides,enableAllVehicles,filterVehicleCatalog,planVehicleImport,resolveVehicleCatalog,saveVehicleBrand,saveVehicleModel,toggleVehicleBrand,toggleVehicleModel,type VehicleCatalog,type VehicleOverrides} from './vehicle-catalog-management';

type Editor={kind:'brand'|'model';id:string;name:string;brandId:string};
type Status='ALL'|'ACTIVE'|'INACTIVE'|'ARCHIVED';
const PAGE_SIZE=60;
const displayStatus=(item:{isActive:boolean;isArchived?:boolean})=>item.isArchived?'Удалено (архив)':item.isActive?'Включено':'Отключено';

export default function VehicleCatalogPage({PageFrame,PanelTitle,LoadingPage,Empty}:{PageFrame:React.ComponentType<any>;PanelTitle:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>}){
 const [seed,setSeed]=useState<VehicleDirectory|null>(null);
 const [overrides,setOverrides]=useState<VehicleOverrides>(emptyVehicleOverrides);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [search,setSearch]=useState(''),[selectedBrand,setSelectedBrand]=useState('');
 const [status,setStatus]=useState<Status>('ALL'),[page,setPage]=useState(1);
 const [newBrand,setNewBrand]=useState(''),[newModel,setNewModel]=useState('');
 const [editor,setEditor]=useState<Editor|null>(null);
 const [deleteKey,setDeleteKey]=useState(''),[bulkScope,setBulkScope]=useState<string|null>(null);
 const [importCsv,setImportCsv]=useState<VehicleDirectory|null>(null),[importFilename,setImportFilename]=useState(''),[importConfirmed,setImportConfirmed]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const [response,current]=await Promise.all([
    fetch('/catalogs/usd_cars.csv',{credentials:'omit',cache:'force-cache'}),
    getSiteSettings(),
   ]);
   if(!response.ok)throw new Error('Не удалось открыть базовый справочник автомобилей.');
   setSeed(parseVehicleDirectoryCsv(await response.text()));
   const saved=current?.settings?.catalogs?.vehicleDirectory;
   setOverrides({brands:Array.isArray(saved?.brands)?saved.brands:[],models:Array.isArray(saved?.models)?saved.models:[]});
  }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить справочник')}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{void load()},[load]);
 const catalog=useMemo(()=>seed?resolveVehicleCatalog(seed,overrides):null,[seed,overrides]);
 const filtered=useMemo(()=>catalog?filterVehicleCatalog(catalog,{search,selectedBrand,status}):{brands:[],models:[]},[catalog,search,selectedBrand,status]);
 const {brands,models}=filtered;
 const brandNames=useMemo(()=>new Map((catalog?.brands??[]).map(b=>[b.id,b.name])),[catalog]);
 const brandModelCounts=useMemo(()=>{
  const counts=new Map<string,number>();
  for(const item of catalog?.models??[])counts.set(item.brandId,(counts.get(item.brandId)??0)+1);
  return counts;
 },[catalog]);
 const pageCount=Math.max(1,Math.ceil(models.length/PAGE_SIZE));
 const actualPage=Math.min(page,pageCount);
 const visibleModels=models.slice((actualPage-1)*PAGE_SIZE,actualPage*PAGE_SIZE);
 const allCounts=catalog?countDisabledVehicles(catalog,'ALL'):{brands:0,models:0,total:0};
 const selectedCounts=catalog&&selectedBrand?countDisabledVehicles(catalog,selectedBrand):{brands:0,models:0,total:0};
 const currentSelection=catalog?.brands.find(b=>b.id===selectedBrand);
 const importPlan=useMemo(()=>{
  if(!catalog||!importCsv)return null;
  try{return planVehicleImport(catalog,overrides,importCsv,()=> 'preview-only')}
  catch(e){return {error:e instanceof Error?e.message:'Не удалось построить предпросмотр'} as const}
 },[catalog,overrides,importCsv]);
 const mutate=async(apply:(catalog:VehicleCatalog,current:VehicleOverrides)=>VehicleOverrides,message:string)=>{
  if(!seed||saving)return false;
  setSaving(true);setError('');setNotice('');
  try{
   const latest=await getSiteSettings();
   const catalogs=latest?.settings?.catalogs??{};
   const stored=catalogs.vehicleDirectory;
   const current:VehicleOverrides={brands:Array.isArray(stored?.brands)?stored.brands:[],models:Array.isArray(stored?.models)?stored.models:[]};
   const newValue=apply(resolveVehicleCatalog(seed,current),current);
   const saved=await updateSiteSettings({catalogs:{_revision:catalogs._revision,vehicleDirectory:newValue}});
   const persisted=saved?.settings?.catalogs?.vehicleDirectory??newValue;
   setOverrides({brands:persisted.brands??[],models:persisted.models??[]});
   invalidateVehicleDirectoryCache();
   setNotice(message);
   return true;
  }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить справочник');return false}
  finally{setSaving(false)}
 };
 const saveEditor=async()=>{
  if(!editor)return;
  const ok=await mutate((c,o)=>editor.kind==='brand'?saveVehicleBrand(c,o,editor.id,editor.name):
   saveVehicleModel(c,o,editor.id,editor.name,editor.brandId),'Изменения сохранены');
  if(ok)setEditor(null);
 };
 const archive=async()=>{
  const split=deleteKey.indexOf(':');const kind=deleteKey.slice(0,split),id=deleteKey.slice(split+1);
  if(!kind||!id)return;
  const ok=await mutate((c,o)=>kind==='brand'?archiveVehicleBrand(c,o,id):archiveVehicleModel(c,o,id),
   'Запись убрана из новых вариантов. Автомобили участников и история сохранены.');
  if(ok){setDeleteKey('');if(kind==='brand'&&selectedBrand===id)setSelectedBrand('')}
 };
 const activate=async()=>{
  if(!bulkScope)return;
  const ok=await mutate((c,o)=>enableAllVehicles(c,o,bulkScope),
   'Отключённые марки и модели включены. Архивные записи не изменены.');
  if(ok)setBulkScope(null);
 };
 const previewFile=async(file:File)=>{
  setImportCsv(null);setImportFilename('');setImportConfirmed(false);setError('');
  try{
   if(file.size>1024*1024)throw new Error('CSV не должен превышать 1 МБ.');
   const data=parseVehicleDirectoryCsv(await file.text());
   if(!catalog)throw new Error('Сначала загрузите справочник.');
   planVehicleImport(catalog,overrides,data,()=> 'preview-only');
   setImportCsv(data);setImportFilename(file.name);
  }catch(e){setError(e instanceof Error?e.message:'Некорректный файл')}
 };
 const importFile=async()=>{
  if(!importCsv||!importConfirmed)return;
  const result=importPlan;
  if(!result||'error' in result)return;
  const ok=await mutate((c,o)=>planVehicleImport(c,o,importCsv,()=>crypto.randomUUID()).overrides,
   'Импорт завершён: добавлено '+result.addedBrands+' марок и '+result.addedModels+' моделей. Существующие записи сохранены.');
  if(ok){setImportCsv(null);setImportConfirmed(false);setImportFilename('')}
 };
 if(loading)return <PageFrame title="Справочник автомобилей" subtitle="Марки и модели для регистрации и личного кабинета"><LoadingPage/></PageFrame>;
 return <PageFrame title="Справочник автомобилей" subtitle="Управление марками и моделями без изменения автомобилей участников" action={<button type="button" className="secondary-button compact" disabled={saving} onClick={()=>void load()}><RefreshCw size={15}/>Обновить</button>}>
  {error&&<div className="form-error" role="alert"><AlertTriangle size={16}/>{error}</div>}
  {notice&&<div className="notice" role="status"><CheckCircle2 size={16}/>{notice}</div>}
  {!seed||!catalog?<Empty text="Справочник недоступен. Повторите загрузку."/>:<>
   <section className="panel vehicle-catalog-summary">
    <PanelTitle title="База автомобилей USD" icon={CarFront}/>
    <div className="vehicle-catalog-metrics"><span><strong>{catalog.brands.length}</strong> марок</span><span><strong>{catalog.models.length}</strong> моделей</span><span><strong>{allCounts.total}</strong> отключённых</span></div>
    <p className="settings-help">За основу взят проверенный CSV USD. В базе настроек сохраняются только ваши изменения, а не тысячи исходных строк. Уже зарегистрированные автомобили не переименовываются и не удаляются.</p>
   </section>
   <section className="panel vehicle-catalog-import" aria-label="Импорт марок и моделей CSV">
    <PanelTitle title="Добавление из CSV" icon={Upload}/>
    <p className="settings-help">Формат: ровно два столбца «марка,модель». Сначала просмотр, затем подтверждение. Дубликаты пропускаются, отключённые марки требуют ручного решения. Не более 300 новых моделей за файл.</p>
    <label className="file-picker"><input type="file" accept=".csv,text/csv" disabled={saving} onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void previewFile(file);e.currentTarget.value=''}}/><span>Выбрать CSV автомобилей</span></label>
    {importCsv&&importPlan&&<div className="catalog-import-preview" aria-live="polite">
     <h3>Предпросмотр · {importFilename}</h3>
     {'error' in importPlan?<p className="form-error">{importPlan.error}</p>:<>
      <p>Новых марок: <strong>{importPlan.addedBrands}</strong>. Новых моделей: <strong>{importPlan.addedModels}</strong>. Уже существует: {importPlan.skipped}.</p>
      <label className="checkbox-row"><input type="checkbox" checked={importConfirmed} onChange={e=>setImportConfirmed(e.target.checked)}/>Подтверждаю добавление новых записей без изменения существующих</label>
      <button type="button" className="primary-button compact" disabled={saving||!importConfirmed||importPlan.addedModels===0} onClick={()=>void importFile()}>Импортировать {importPlan.addedModels} моделей</button>
     </>}
     <button type="button" className="secondary-button compact" disabled={saving} onClick={()=>{setImportCsv(null);setImportFilename('');setImportConfirmed(false)}}>Отмена</button>
    </div>}
   </section>
   <section className="panel vehicle-catalog-bulk">
    <PanelTitle title="Массовое включение" icon={CheckCircle2}/>
    <p className="settings-help">За одно сохранение включаются отключённые марки и модели. Удалённые (архивные) записи восстанавливаются отдельно.</p>
    <div className="catalog-bulk-actions">
     <button type="button" className="secondary-button compact" disabled={saving||!selectedBrand||selectedCounts.total===0} onClick={()=>setBulkScope(selectedBrand)}>Включить все у марки · {selectedCounts.total}</button>
     <button type="button" className="secondary-button compact" disabled={saving||allCounts.total===0} onClick={()=>setBulkScope('ALL')}>Включить все марки и модели · {allCounts.total}</button>
    </div>
    {bulkScope&&<div className="catalog-inline-confirm" role="group"><span>Подтвердить включение {countDisabledVehicles(catalog,bulkScope).total} записей ({bulkScope==='ALL'?'весь справочник':brandNames.get(bulkScope)})?</span><button type="button" className="primary-button compact" disabled={saving} onClick={()=>void activate()}>Подтвердить</button><button type="button" className="secondary-button compact" onClick={()=>setBulkScope(null)}>Отмена</button></div>}
   </section>
   <div className="toolbar catalog-filter-bar"><div className="search-box"><Search size={15}/><input aria-label="Поиск марок и моделей" placeholder="Марка или модель" value={search} onChange={e=>{setSearch(e.target.value);setSelectedBrand('');setPage(1)}}/></div><label className="catalog-filter-label">Статус<select aria-label="Статус записей автомобилей" value={status} onChange={e=>{setStatus(e.target.value as Status);setPage(1)}}><option value="ALL">Все</option><option value="ACTIVE">Включены</option><option value="INACTIVE">Отключены</option><option value="ARCHIVED">Удалённые (архив)</option></select></label></div>
   <div className="catalog-two-column">
    <section className="panel">
     <PanelTitle title={'Марки · '+brands.length} icon={CarFront}/>
     <form className="catalog-add-row" onSubmit={e=>{e.preventDefault();void mutate((c,o)=>addVehicleBrand(c,o,crypto.randomUUID(),newBrand),'Марка добавлена').then(ok=>{if(ok)setNewBrand('')})}}>
      <input aria-label="Название новой марки автомобиля" placeholder="Добавить марку" value={newBrand} onChange={e=>setNewBrand(e.target.value)} maxLength={100} required/>
      <button type="submit" className="primary-button compact" disabled={saving||!newBrand.trim()}><Plus size={14}/>Добавить</button>
     </form>
     <div className="catalog-list vehicle-catalog-brand-list">{brands.map(b=><div className={'catalog-list-row catalog-manage-row '+(selectedBrand===b.id?'selected':'')} key={b.id}>
      {editor?.kind==='brand'&&editor.id===b.id?
       <form className="catalog-inline-editor" onSubmit={e=>{e.preventDefault();void saveEditor()}}><label>Название марки<input autoFocus maxLength={100} value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/></label><div className="catalog-row-actions"><button type="submit" className="primary-button compact" disabled={saving||!editor.name.trim()}>Сохранить</button><button type="button" className="secondary-button compact" onClick={()=>setEditor(null)}>Отмена</button></div></form>:
       <><button type="button" className="catalog-list-select" aria-pressed={selectedBrand===b.id} onClick={()=>{setSelectedBrand(b.id);setPage(1)}}><strong>{b.name}</strong><small>{displayStatus(b)} · {brandModelCounts.get(b.id)??0} моделей</small></button><div className="catalog-row-actions">
        <button type="button" className="secondary-button compact" disabled={saving} onClick={()=>setEditor({kind:'brand',id:b.id,name:b.name,brandId:b.id})}><Pencil size={13}/>Редактировать</button>
        <button type="button" className="secondary-button compact" disabled={saving} onClick={()=>void mutate((c,o)=>toggleVehicleBrand(c,o,b.id),'Статус марки сохранён')}>{b.isArchived?'Восстановить':b.isActive?'Отключить':'Включить'}</button>
        {!b.isArchived&&(deleteKey==='brand:'+b.id?<div className="catalog-inline-confirm" role="group"><span>Убрать марку из вариантов? История не изменится.</span><button type="button" className="danger-button compact" disabled={saving} onClick={()=>void archive()}>Подтвердить</button><button type="button" className="secondary-button compact" onClick={()=>setDeleteKey('')}>Отмена</button></div>:<button type="button" className="danger-button compact" disabled={saving} onClick={()=>setDeleteKey('brand:'+b.id)}><Trash2 size={13}/>Удалить</button>)}
       </div></>}
     </div>)}{brands.length===0&&<Empty text="Марки по фильтру не найдены"/>}</div>
    </section>
    <section className="panel">
     <PanelTitle title={'Модели · '+models.length} icon={CarFront}/>
     <p className="settings-help">{currentSelection?'Выбрана марка: '+currentSelection.name:'Выберите марку слева. Ниже показаны все модели каталога.'}</p>
     <form className="catalog-add-row" onSubmit={e=>{e.preventDefault();if(!selectedBrand)return;void mutate((c,o)=>addVehicleModel(c,o,crypto.randomUUID(),selectedBrand,newModel),'Модель добавлена').then(ok=>{if(ok)setNewModel('')})}}>
      <input aria-label="Новая модель автомобиля" placeholder="Добавить модель выбранной марки" disabled={!selectedBrand} maxLength={120} value={newModel} onChange={e=>setNewModel(e.target.value)} required/>
      <button type="submit" className="primary-button compact" disabled={saving||!selectedBrand||!newModel.trim()}><Plus size={14}/>Добавить</button>
     </form>
     {selectedBrand&&<button type="button" className="secondary-button compact vehicle-catalog-clear" onClick={()=>{setSelectedBrand('');setPage(1)}}>Показать все марки</button>}
     <div className="catalog-list vehicle-catalog-model-list">{visibleModels.map(m=><div className="catalog-list-row catalog-manage-row" key={m.id}>
      {editor?.kind==='model'&&editor.id===m.id?
       <form className="catalog-inline-editor" onSubmit={e=>{e.preventDefault();void saveEditor()}}><label>Модель<input autoFocus maxLength={120} value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/></label><label>Марка<select value={editor.brandId} onChange={e=>setEditor({...editor,brandId:e.target.value})}>{catalog.brands.filter(b=>b.isActive&&!b.isArchived).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><div className="catalog-row-actions"><button type="submit" className="primary-button compact" disabled={saving||!editor.name.trim()}>Сохранить</button><button type="button" className="secondary-button compact" onClick={()=>setEditor(null)}>Отмена</button></div></form>:
       <><div className="catalog-model-label"><strong>{m.name}</strong><small>{brandNames.get(m.brandId)} · {displayStatus(m)}</small></div><div className="catalog-row-actions">
        <button type="button" className="secondary-button compact" disabled={saving} onClick={()=>setEditor({kind:'model',id:m.id,name:m.name,brandId:m.brandId})}><Pencil size={13}/>Редактировать</button>
        <button type="button" className="secondary-button compact" disabled={saving} onClick={()=>void mutate((c,o)=>toggleVehicleModel(c,o,m.id),'Статус модели сохранён')}>{m.isArchived?'Восстановить':m.isActive?'Отключить':'Включить'}</button>
        {!m.isArchived&&(deleteKey==='model:'+m.id?<div className="catalog-inline-confirm" role="group"><span>Убрать модель из вариантов?</span><button type="button" className="danger-button compact" disabled={saving} onClick={()=>void archive()}>Подтвердить</button><button type="button" className="secondary-button compact" onClick={()=>setDeleteKey('')}>Отмена</button></div>:<button type="button" className="danger-button compact" disabled={saving} onClick={()=>setDeleteKey('model:'+m.id)}><Trash2 size={13}/>Удалить</button>)}
       </div></>}
     </div>)}{models.length===0&&<Empty text="Модели не найдены"/>}</div>
     {pageCount>1&&<div className="list-pagination"><span>Страница {actualPage} из {pageCount} · всего {models.length} моделей</span><nav aria-label="Страницы моделей"><button type="button" className="secondary-button compact" disabled={actualPage<=1} onClick={()=>setPage(x=>Math.max(1,Math.min(x,pageCount)-1))}>Назад</button><button type="button" className="secondary-button compact" disabled={actualPage>=pageCount} onClick={()=>setPage(x=>Math.min(pageCount,Math.min(x,pageCount)+1))}>Дальше</button></nav></div>}
    </section>
   </div>
  </>}
 </PageFrame>;
}
