import {useEffect,useState} from 'react';
import {AlertTriangle,Check,CheckCircle2,Layers,Package,Plus,RefreshCw,Search,Trash2,Pencil} from 'lucide-react';
import {activationCounts,archiveCatalogBrand,archiveCatalogModel,editComponentModel,enableAllCatalogItems,renameComponentBrand,toggleCatalogBrand,toggleCatalogModel,type ComponentCatalog} from './component-catalog-management';
import {getSiteSettings,updateSiteSettings,getComponentCatalogRequests,approveComponentCatalogRequest,rejectComponentCatalogRequest,retryComponentCatalogRequestEmail} from '../api';
import {parseAudioCatalogCsv,planAudioCatalogImport,type AudioCsvRow,MAX_AUDIO_CSV_BYTES} from './catalog-csv-import';

type CatalogMode='vibration'|'components';
type CatalogCategory='HEAD_UNIT'|'AUDIO_COMPONENT'|'AMPLIFIER'|'SUBWOOFER'|'DSP'|'BATTERY'|'GENERATOR'|'WIRING'|'ACCESSORY';
const CATALOG_CATEGORIES:{value:CatalogCategory;label:string}[]=[
 {value:'HEAD_UNIT',label:'Головные устройства'},
 {value:'AUDIO_COMPONENT',label:'Акустика и динамики'},
 {value:'AMPLIFIER',label:'Усилители'},
 {value:'SUBWOOFER',label:'Сабвуферы'},
 {value:'DSP',label:'Процессоры / DSP'},
 {value:'BATTERY',label:'Аккумуляторы'},
 {value:'GENERATOR',label:'Генераторы'},
 {value:'WIRING',label:'Проводка и силовые компоненты'},
 {value:'ACCESSORY',label:'Аксессуары'},
];
const DEFAULT_VIBRATION_BRANDS=['STP','ComfortMat','Audior','Global'];
export function CatalogPage({mode,PageFrame,PanelTitle,LoadingPage,Empty}:{mode:CatalogMode;PageFrame:React.ComponentType<any>;PanelTitle:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>}){
 const vibration=mode==='vibration';
 const [settings,setSettings]=useState<any|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[query,setQuery]=useState('');
 const [batteryCode,setBatteryCode]=useState(''),[batteryName,setBatteryName]=useState(''),[batteryChemistry,setBatteryChemistry]=useState('LEAD_ACID'),[batteryConstruction,setBatteryConstruction]=useState('AGM'),[batteryDrafts,setBatteryDrafts]=useState<Record<string,{name:string;chemistry:string;construction:string}>>({});
 const [importRows,setImportRows]=useState<AudioCsvRow[]|null>(null),[importFilename,setImportFilename]=useState(''),[importConfirmed,setImportConfirmed]=useState(false);
 const [brand,setBrand]=useState(''),[category,setCategory]=useState<CatalogCategory>('HEAD_UNIT'),[modelBrand,setModelBrand]=useState(''),[model,setModel]=useState(''),[confirmRemoveKey,setConfirmRemoveKey]=useState(''),[requests,setRequests]=useState<any[]>([]),[requestBusy,setRequestBusy]=useState(''),[requestNote,setRequestNote]=useState<Record<string,string>>({}),[lifecycleFilter,setLifecycleFilter]=useState<'ALL'|'ACTIVE'|'DISCONTINUED'>('ALL');
 const [activityFilter,setActivityFilter]=useState<'ALL'|'ENABLED'|'DISABLED'|'ARCHIVED'>('ALL');
 const [editor,setEditor]=useState<{kind:'brand'|'model';id:string;value:string;brand:string}|null>(null);
 const [confirmBulkScope,setConfirmBulkScope]=useState<'ALL'|CatalogCategory|null>(null);
 const load=async()=>{setLoading(true);setError('');try{const r=await getSiteSettings();const raw=r?.settings??{};const catalogs=raw.catalogs??{};setSettings({...raw,catalogs:{...catalogs,vibrationBrands:Array.isArray(catalogs.vibrationBrands)?catalogs.vibrationBrands:DEFAULT_VIBRATION_BRANDS,componentBrands:Array.isArray(catalogs.componentBrands)?catalogs.componentBrands:[],componentModels:Array.isArray(catalogs.componentModels)?catalogs.componentModels:[],batteryTypes:Array.isArray(catalogs.batteryTypes)?catalogs.batteryTypes:[],teams:Array.isArray(catalogs.teams)?catalogs.teams:[]}})}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить справочник')}finally{setLoading(false)}};
 useEffect(()=>{void load();if(!vibration)void getComponentCatalogRequests().then(r=>setRequests(Array.isArray(r?.items)?r.items:[])).catch(()=>{})},[]);
 const catalogs=settings?.catalogs??{vibrationBrands:DEFAULT_VIBRATION_BRANDS,componentBrands:[],componentModels:[],teams:[]};
 const addBatteryType=async()=>{
  const code=batteryCode.trim().toUpperCase(),name=batteryName.trim();
  if(!/^[A-Z0-9_]{2,32}$/.test(code)||!name){setError('Укажите код (латиница, цифры) и название типа аккумулятора.');return}
  if((catalogs.batteryTypes??[]).some((x:any)=>x.code===code)){setError('Тип с таким кодом уже существует.');return}
  await saveCatalogs({...catalogs,batteryTypes:[...(catalogs.batteryTypes??[]),{code,name,chemistry:batteryChemistry,construction:batteryConstruction,isActive:true}]});
  setBatteryCode('');setBatteryName('');
 };
 const saveBatteryType=async(item:any)=>{
  const next=batteryDrafts[item.code]??{name:item.name,chemistry:item.chemistry,construction:item.construction};
  await saveCatalogs({...catalogs,batteryTypes:(catalogs.batteryTypes??[]).map((x:any)=>x.code===item.code?{...x,...next}:x)});
 };
 const saveCatalogs=async(next:any)=>{if(!settings||saving)return;setSaving(true);setError('');setNotice('');try{const result=await updateSiteSettings({catalogs:next});setSettings((old:any)=>({...old,catalogs:result?.settings?.catalogs??next}));setNotice('Изменения сохранены')}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить справочник')}finally{setSaving(false)}};
 const applyCatalogAction=async(change:(value:ComponentCatalog)=>ComponentCatalog,message:string)=>{
  if(saving)return false;
  setSaving(true);setError('');setNotice('');
  try{
   // Transform the latest server snapshot: one admin must not overwrite another
   // admin's imports or unrelated site settings with a stale whole-form PATCH.
   const current=await getSiteSettings();
   const old=current?.settings?.catalogs??{};
   const next=change({...old,componentBrands:old.componentBrands??[],componentModels:old.componentModels??[]});
   const saved=await updateSiteSettings({catalogs:next});
   setSettings((previous:any)=>({...previous,catalogs:saved?.settings?.catalogs??next}));
   setNotice(message);
   return true;
  }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить изменения');return false}
  finally{setSaving(false)}
 };
 const saveEditor=async()=>{
  if(!editor)return;
  const ok=await applyCatalogAction(c=>editor.kind==='brand'?
   renameComponentBrand(c,editor.id,editor.value):editComponentModel(c,editor.id,editor.value,editor.brand),'Изменения сохранены');
  if(ok){if(editor.kind==='brand'&&modelBrand) setModelBrand('');setEditor(null)}
 };
 const deleteCatalogEntry=async(kind:'brand'|'model',id:string)=>{
  const ok=await applyCatalogAction(c=>kind==='brand'?archiveCatalogBrand(c,id):archiveCatalogModel(c,id),
   'Запись убрана из выбора. ID и история конфигураций сохранены.');
  if(ok){setConfirmRemoveKey('');if(kind==='brand')setModelBrand('')}
 };
 const activateAll=async(scope:'ALL'|CatalogCategory)=>{
  const ok=await applyCatalogAction(c=>enableAllCatalogItems(c,scope),
    scope==='ALL'?'Все доступные марки и модели включены':'Марки и модели категории включены');
  if(ok)setConfirmBulkScope(null);
 };
 const addVibrationBrand=async()=>{const value=brand.trim();if(!value)return;if(catalogs.vibrationBrands.some((x:string)=>x.toLocaleLowerCase('ru')===value.toLocaleLowerCase('ru'))){setError('Такая марка уже есть в справочнике');return}await saveCatalogs({...catalogs,vibrationBrands:[...catalogs.vibrationBrands,value].sort((a:string,b:string)=>a.localeCompare(b,'ru'))});setBrand('')};
 const removeVibrationBrand=async(value:string)=>{await saveCatalogs({...catalogs,vibrationBrands:catalogs.vibrationBrands.filter((x:string)=>x!==value)})};
 const matchesActivity=(x:any)=>activityFilter==='ALL'||(activityFilter==='ARCHIVED'?x.isArchived===true:activityFilter==='ENABLED'?x.isActive!==false&&!x.isArchived:x.isActive===false&&!x.isArchived);
 const brands=(catalogs.componentBrands as any[]).filter((x:any)=>x.category===category).filter(matchesActivity).filter((x:any)=>!query||x.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))).sort((a:any,b:any)=>a.name.localeCompare(b.name,'ru'));
 const selectBrands=(catalogs.componentBrands as any[]).filter((x:any)=>x.category===category&&!x.isArchived).sort((a:any,b:any)=>a.name.localeCompare(b.name,'ru'));
 const models=(catalogs.componentModels as any[]).filter((x:any)=>x.category===category&&(!modelBrand||x.brand===modelBrand)).filter(matchesActivity).filter((x:any)=>lifecycleFilter==='ALL'||(x.lifecycle??'UNKNOWN')===lifecycleFilter).filter((x:any)=>!query||[x.brand,x.model].join(' ').toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))).sort((a:any,b:any)=>a.brand.localeCompare(b.brand,'ru')||a.model.localeCompare(b.model,'ru'));
 const componentCatalog=catalogs as ComponentCatalog;
 const categoryCounts=activationCounts(componentCatalog,category);
 const allCounts=activationCounts(componentCatalog,'ALL');
 const addComponentBrand=async()=>{const value=brand.trim();if(!value)return;if(catalogs.componentBrands.some((x:any)=>x.category===category&&x.name.toLocaleLowerCase('ru')===value.toLocaleLowerCase('ru'))){setError('Эта марка уже есть в выбранной категории');return}await saveCatalogs({...catalogs,componentBrands:[...catalogs.componentBrands,{id:crypto.randomUUID(),category,name:value,isActive:true}].sort((a:any,b:any)=>a.name.localeCompare(b.name,'ru'))});setBrand('')};
 const addComponentModel=async()=>{const value=model.trim();if(brands.some((x:any)=>x.name===modelBrand&&x.isActive===false)){setError('Сначала включите марку.');return}if(!modelBrand){setError('Сначала выберите марку');return}if(!value)return;if(catalogs.componentModels.some((x:any)=>x.category===category&&x.brand===modelBrand&&x.model.toLocaleLowerCase('ru')===value.toLocaleLowerCase('ru'))){setError('Эта модель уже есть у выбранной марки');return}await saveCatalogs({...catalogs,componentModels:[...catalogs.componentModels,{id:crypto.randomUUID(),category,brand:modelBrand,model:value,isActive:true,lifecycle:'ACTIVE',sourceType:'ADMIN_ADDED',verifiedAt:new Date().toISOString()}].sort((a:any,b:any)=>a.brand.localeCompare(b.brand,'ru')||a.model.localeCompare(b.model,'ru'))});setModel('')};
 // Preserve IDs and historical snapshots when changing availability.
 const toggleComponentBrand=async(item:any)=>{const active=item.isActive===false||item.isArchived;const ok=await applyCatalogAction(c=>toggleCatalogBrand(c,item.id),'Марка '+(active?'включена':'отключена'));if(ok&&!active&&modelBrand===item.name)setModelBrand('')};
 const toggleComponentModel=async(item:any)=>{await applyCatalogAction(c=>toggleCatalogModel(c,item.id),'Статус модели обновлён')};
 // A CSV is only read locally until the administrator has reviewed the preview.
 // Never replace historical catalog entries or submit unrelated site settings.
 const importPreview=(()=>{
  if(!importRows)return null;
  try{return planAudioCatalogImport(catalogs,importRows,()=> 'preview-only')}
  catch{return null}
 })();
 const previewCsv=async(file:File)=>{
  setImportRows(null);setImportConfirmed(false);setImportFilename('');setError('');setNotice('');
  try{
   if(file.size>MAX_AUDIO_CSV_BYTES)throw new Error('CSV превышает лимит 1 МБ.');
   const rows=parseAudioCatalogCsv(await file.text());
   planAudioCatalogImport(catalogs,rows,()=> 'preview-only');
   setImportRows(rows);setImportFilename(file.name);
  }catch(error){setError(error instanceof Error?error.message:'Не удалось прочитать CSV')}
 };
 const applyCsv=async()=>{
  if(!settings||!importRows||!importConfirmed||saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   // Re-read current admin catalog so an older screen cannot undo new entries
   // that another administrator added while the CSV was being reviewed.
   const current=await getSiteSettings();
   const freshCatalogs=current?.settings?.catalogs??{};
   const merged=planAudioCatalogImport(freshCatalogs,importRows,()=>crypto.randomUUID());
   if(merged.addedModels){
    const saved=await updateSiteSettings({catalogs:merged.catalogs});
    setSettings((old:any)=>({...old,catalogs:saved?.settings?.catalogs??merged.catalogs}));
   }else{
    setSettings((old:any)=>({...old,catalogs:freshCatalogs}));
   }
   setNotice('Импорт завершён: добавлено '+merged.addedModels+' моделей и '+merged.addedBrands+' марок. Уже существующие записи и их ID сохранены.');
   setImportRows(null);setImportFilename('');setImportConfirmed(false);
  }catch(error){setError(error instanceof Error?error.message:'Не удалось импортировать каталог')}
  finally{setSaving(false)}
 };
 if(loading)return <PageFrame title={vibration?'Виброизоляция':'Комплектующие'} subtitle="Управляемый справочник для конфигураций автомобилей"><LoadingPage/></PageFrame>;
 return <PageFrame title={vibration?'Виброизоляция':'Комплектующие'} subtitle={vibration?'Марки виброизоляции, доступные при описании конфигурации автомобиля':'Каталог марок и моделей оборудования автозвука по категориям'} action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>
 {error&&<div className="form-error"><AlertTriangle size={16}/><span>{error}</span></div>}{notice&&<div className="notice"><CheckCircle2 size={16}/>{notice}</div>}
 {!vibration&&<section className="panel catalog-import-panel" aria-label="Импорт оборудования из CSV">
  <PanelTitle title="Массовый импорт моделей" icon={Package}/>
  <p className="settings-help">Загрузите CSV из справочников USD: ровно три столбца «бренд,модель,категория». Поддерживаются усилители, сабвуферы, акустика, головные устройства и DSP. Файл проверяется в браузере; данные не меняются до явного подтверждения. Существующие модели, статусы и ID не заменяются.</p>
  <label className="file-picker">
   <input type="file" accept=".csv,text/csv" disabled={saving} onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void previewCsv(file);e.currentTarget.value=''}}/>
   <span>{importFilename?'Выбрать другой CSV':'Выбрать CSV (до 1 МБ)'}</span>
  </label>
  {importRows&&<div className="catalog-import-preview" aria-live="polite">
   <h3>Предпросмотр импорта: {importFilename}</h3>
   {importPreview?<><p className="settings-help">Моделей в файле: {importRows.length}. Новых моделей: <strong>{importPreview.addedModels}</strong>, новых марок: <strong>{importPreview.addedBrands}</strong>, уже существующих: {importPreview.unchangedModels}.</p>
    <div className="catalog-list" aria-label="Примеры записей из файла">{importRows.slice(0,8).map((entry,index)=><div className="catalog-list-row" key={index}><span>{entry.brand} — {entry.model}</span><small>{entry.category}</small></div>)}</div>
    <label className="checkbox-row"><input type="checkbox" checked={importConfirmed} onChange={e=>setImportConfirmed(e.target.checked)}/>Подтверждаю добавление проверенных моделей в публичный справочник USD</label>
    <button type="button" className="primary-button compact" disabled={saving||!importConfirmed||importPreview.addedModels===0} onClick={()=>void applyCsv()}><Check size={15}/>{saving?'Сохранение…':'Импортировать '+importPreview.addedModels+' моделей'}</button>
   </>:<p className="form-error" role="alert">Справочник изменился или содержит отключённую марку. Обновите страницу и проверьте CSV.</p>}
   <button type="button" className="secondary-button compact" disabled={saving} onClick={()=>{setImportRows(null);setImportFilename('');setImportConfirmed(false)}}>Отменить импорт</button>
  </div>}
 </section>}
 { !vibration && <div className="panel component-request-queue"><PanelTitle title={`Очередь запросов участников · ${requests.filter((x:any)=>x.status==='PENDING').length}`} icon={Package}/><p className="settings-help">Запросы приходят сюда и на email администраторов. После добавления модели участник получает сервисное письмо.</p>{requests.length===0?<Empty text="Запросов пока нет"/>:<div className="catalog-list">{requests.map((item:any)=><article className="catalog-request-row" key={item.id}><div className="catalog-model-label"><strong>{item.brand} {item.model}</strong><small>{CATALOG_CATEGORIES.find(x=>x.value===item.category)?.label??item.category} · {item.userEmail}</small><small>{new Date(item.createdAt).toLocaleString('ru-RU')} · {item.status==='PENDING'?'Ожидает':item.status==='APPROVED'?'Добавлено':'Отклонено'}</small><small>Письмо администратору: {item.adminEmailStatus==='PROVIDER_ACCEPTED'?'провайдер принял':item.adminEmailStatus==='FAILED'?'ошибка отправки':'ожидает отправки'}{item.status==='APPROVED'?' · письмо участнику: '+(item.participantEmailStatus==='PROVIDER_ACCEPTED'?'провайдер принял':item.participantEmailStatus==='FAILED'?'ошибка отправки':'ожидает отправки'):''}</small>{item.details&&<p>{item.details}</p>}{item.adminNote&&<small>Комментарий: {item.adminNote}</small>}</div>{(item.adminEmailStatus==='FAILED'||(item.status==='APPROVED'&&item.participantEmailStatus==='FAILED'))&&<button className="secondary-button compact" disabled={!!requestBusy} onClick={async()=>{setRequestBusy(item.id);try{await retryComponentCatalogRequestEmail(item.id);const r=await getComponentCatalogRequests();setRequests(r.items??[])}catch(e){setError(e instanceof Error?e.message:'Не удалось повторить отправку письма')}finally{setRequestBusy('')}}}>Повторить отправку письма</button>}{item.status==='PENDING'&&<div className="catalog-request-actions"><input value={requestNote[item.id]??''} onChange={e=>setRequestNote(s=>({...s,[item.id]:e.target.value}))} placeholder="Комментарий участнику (необязательно)"/><div className="catalog-category-tabs"><button className="primary-button compact" disabled={!!requestBusy} onClick={async()=>{setRequestBusy(item.id);try{await approveComponentCatalogRequest(item.id,requestNote[item.id]);const r=await getComponentCatalogRequests();setRequests(r.items??[]);await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось добавить комплектующее')}finally{setRequestBusy('')}}}>{requestBusy===item.id?'Обработка…':'Добавить и уведомить'}</button><button className="secondary-button compact" disabled={!!requestBusy} onClick={async()=>{setRequestBusy(item.id);try{await rejectComponentCatalogRequest(item.id,requestNote[item.id]);const r=await getComponentCatalogRequests();setRequests(r.items??[])}catch(e){setError(e instanceof Error?e.message:'Не удалось отклонить запрос')}finally{setRequestBusy('')}}}>Отклонить</button></div></div>}</article>)}</div>}</div> }

 {vibration?<><div className="panel catalog-add-panel"><PanelTitle title="Добавить марку" icon={Layers}/><p className="settings-help">Здесь хранятся только бренды виброизоляции — без шумоизоляции и прочих материалов.</p><form className="catalog-add-row" onSubmit={e=>{e.preventDefault();void addVibrationBrand()}}><input value={brand} onChange={e=>setBrand(e.target.value)} placeholder="Например, STP, ComfortMat, Audior" required/><button className="primary-button compact" disabled={saving||!brand.trim()}><Plus size={15}/>Добавить</button></form></div><div className="panel"><PanelTitle title={'Марки в справочнике · '+catalogs.vibrationBrands.length} icon={Layers}/><div className="catalog-chip-list">{catalogs.vibrationBrands.filter((x:string)=>x.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))).map((x:string)=><div className="catalog-chip" key={x}><strong>{x}</strong>{confirmRemoveKey==='vibration:'+x?<span className="inline-confirm-actions"><span>Удалить марку?</span><button className="danger-button compact" disabled={saving} onClick={()=>void removeVibrationBrand(x)}>Подтвердить</button><button className="secondary-button compact" onClick={()=>setConfirmRemoveKey("")}>Отмена</button></span>:<button className="icon-button danger" disabled={saving} title={'Удалить '+x} onClick={()=>setConfirmRemoveKey('vibration:'+x)}><Trash2 size={14}/></button>}</div>)}{!catalogs.vibrationBrands.length&&<Empty text="Добавьте первую марку виброизоляции"/>}</div></div></>:<><div className="panel catalog-category-panel"><PanelTitle title="Категория оборудования" icon={Package}/><div className="catalog-category-tabs">{CATALOG_CATEGORIES.map(x=><button key={x.value} className={'secondary-button compact '+(category===x.value?'active':'')} onClick={()=>{setCategory(x.value);setModelBrand('');setBrand('');setModel('');setError('');setNotice('')}}>{x.label}</button>)}</div></div><div className="catalog-two-column"><div className="panel"><PanelTitle title="Марки" icon={Layers}/><form className="catalog-add-row" onSubmit={e=>{e.preventDefault();void addComponentBrand()}}><input value={brand} onChange={e=>setBrand(e.target.value)} placeholder="Новая марка" required/><button className="primary-button compact" disabled={saving||!brand.trim()}><Plus size={15}/>Добавить</button></form><div className="catalog-list">{brands.map((x:any)=><div className={'catalog-list-row '+(modelBrand===x.name?'selected':'')} key={x.id}><button className="catalog-list-select" onClick={()=>setModelBrand(x.name)}><strong>{x.name}</strong><small>{x.isActive===false?'Отключена · ':''}{catalogs.componentModels.filter((m:any)=>m.category===category&&m.brand===x.name&&m.isActive!==false).length} активных моделей</small></button><button type="button" className="secondary-button compact" disabled={saving} onClick={()=>void toggleComponentBrand(x)}>{x.isActive===false?'Включить марку':'Отключить марку'}</button></div>)}{!brands.length&&<Empty text="В этой категории пока нет марок"/>}</div></div><div className="panel"><PanelTitle title="Модели" icon={Package}/><p className="settings-help">Отключённые модели сохраняют ID и историю, но недоступны для новых конфигураций. После включения марки модели включаются отдельно.</p><p className="settings-help">{modelBrand?'Выбрана марка: '+modelBrand:'Выберите марку слева, чтобы добавлять модели.'}</p><form className="catalog-add-row" onSubmit={e=>{e.preventDefault();void addComponentModel()}}><select value={modelBrand} onChange={e=>setModelBrand(e.target.value)} required><option value="">Выберите марку</option>{brands.map((x:any)=><option key={x.id} value={x.name}>{x.name}</option>)}</select><input value={model} onChange={e=>setModel(e.target.value)} placeholder="Модель / серия" required/><button className="primary-button compact" disabled={saving||!modelBrand||!model.trim()}><Plus size={15}/>Добавить</button></form><div className="toolbar"><div className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск марки или модели"/></div><div className="catalog-category-tabs"><button className={"secondary-button compact "+(lifecycleFilter==='ALL'?'active':'')} onClick={()=>setLifecycleFilter('ALL')}>Все</button><button className={"secondary-button compact "+(lifecycleFilter==='ACTIVE'?'active':'')} onClick={()=>setLifecycleFilter('ACTIVE')}>Актуальные</button><button className={"secondary-button compact "+(lifecycleFilter==='DISCONTINUED'?'active':'')} onClick={()=>setLifecycleFilter('DISCONTINUED')}>Снятые с производства</button></div></div><div className="catalog-list">{models.map((x:any)=><div className="catalog-list-row" key={x.id}><div className="catalog-model-label"><strong>{x.model}</strong><small>{x.brand} · {x.isActive===false?'отключена · ':''}{(x.lifecycle??'UNKNOWN')==='DISCONTINUED'?'снята с производства':(x.lifecycle??'UNKNOWN')==='ACTIVE'?'актуальная модель':'статус не проверен'}</small></div><button className="secondary-button compact" disabled={saving} onClick={()=>void saveCatalogs({...catalogs,componentModels:catalogs.componentModels.map((m:any)=>m.id===x.id?{...m,lifecycle:m.lifecycle==='DISCONTINUED'?'ACTIVE':'DISCONTINUED'}:m)})}>{x.lifecycle==='DISCONTINUED'?'Вернуть в актуальные':'Отметить снятой'}</button><button type="button" className="secondary-button compact" disabled={saving} onClick={()=>void toggleComponentModel(x)}>{x.isActive===false?'Включить модель':'Отключить модель'}</button></div>)}{!models.length&&<Empty text={modelBrand?'У этой марки пока нет моделей':'Нет моделей по выбранному фильтру'}/>}</div></div></div></>}
 {!vibration&&<section className="panel" aria-label="Типы аккумуляторов">
  <PanelTitle title={'Типы аккумуляторов · '+(catalogs.batteryTypes??[]).length} icon={Layers}/>
  <p className="settings-help">Химия и конструкция — разные свойства. AGM, GEL и EFB относятся к свинцово-кислотным аккумуляторам. Не удаляйте используемый тип: отключите его для новых конфигураций.</p>
  <form className="catalog-add-row" onSubmit={e=>{e.preventDefault();void addBatteryType()}}>
   <input aria-label="Код типа аккумулятора" value={batteryCode} onChange={e=>setBatteryCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,''))} maxLength={32} placeholder="Код (например, LTO)" required/>
   <input aria-label="Название типа аккумулятора" value={batteryName} onChange={e=>setBatteryName(e.target.value)} maxLength={100} placeholder="Название типа" required/>
   <select aria-label="Химия нового аккумулятора" value={batteryChemistry} onChange={e=>{const v=e.target.value;setBatteryChemistry(v);setBatteryConstruction(v==='LEAD_ACID'?'AGM':'CELLS')}}><option value="LTO">LTO</option><option value="LFP">LiFePO4 / LFP</option><option value="NMC">NMC</option><option value="LEAD_ACID">Свинцово-кислотный</option></select>
   <select aria-label="Конструкция нового аккумулятора" value={batteryConstruction} onChange={e=>setBatteryConstruction(e.target.value)}>{(batteryChemistry==='LEAD_ACID'?['AGM','GEL','FLOODED','EFB']:['CELLS']).map(x=><option key={x} value={x}>{x}</option>)}</select>
   <button type="submit" className="primary-button compact" disabled={saving||!batteryCode.trim()||!batteryName.trim()}><Plus size={15}/>Добавить</button>
  </form>
  <div className="catalog-list">{(catalogs.batteryTypes??[]).map((item:any)=>{
   const draft=batteryDrafts[item.code]??{name:item.name,chemistry:item.chemistry,construction:item.construction};
   return <div className="catalog-list-row battery-catalog-row" key={item.code}>
    <div className="catalog-model-label"><strong>{item.code}</strong><small>{item.isActive===false?'Отключён':'Доступен'} · {draft.chemistry} / {draft.construction}</small></div>
    <input aria-label={'Название '+item.code} value={draft.name} maxLength={100} onChange={e=>setBatteryDrafts(s=>({...s,[item.code]:{...draft,name:e.target.value}}))}/>
    <select aria-label={'Химия '+item.code} value={draft.chemistry} onChange={e=>{const chemistry=e.target.value;setBatteryDrafts(s=>({...s,[item.code]:{...draft,chemistry,construction:chemistry==='LEAD_ACID'?'AGM':'CELLS'}}))}}><option value="LTO">LTO</option><option value="LFP">LFP</option><option value="NMC">NMC</option><option value="LEAD_ACID">Свинцово-кислотный</option></select>
    <select aria-label={'Конструкция '+item.code} value={draft.construction} onChange={e=>setBatteryDrafts(s=>({...s,[item.code]:{...draft,construction:e.target.value}}))}>{(draft.chemistry==='LEAD_ACID'?['AGM','GEL','FLOODED','EFB']:['CELLS']).map(x=><option key={x} value={x}>{x}</option>)}</select>
    <button className="secondary-button compact" disabled={saving||!draft.name.trim()} onClick={()=>void saveBatteryType(item)}>Сохранить</button>
    <button className="secondary-button compact" disabled={saving} onClick={()=>void saveCatalogs({...catalogs,batteryTypes:catalogs.batteryTypes.map((x:any)=>x.code===item.code?{...x,isActive:x.isActive===false}:x)})}>{item.isActive===false?'Включить':'Отключить'}</button>
   </div>;
  })}</div>
 </section>}
 </PageFrame>
}

export default CatalogPage;
