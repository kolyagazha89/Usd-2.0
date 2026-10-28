import {useEffect,useState} from 'react';
import {Activity,AlertTriangle,BatteryCharging,CarFront,Check,CheckCircle2,ChevronLeft,ChevronRight,Database,FileText,Gauge,Info,Layers3,Loader2,MoreHorizontal,Pencil,Plus,RefreshCw,Settings2,Volume2,X} from 'lucide-react';
import {apiGet,apiPost,apiPut,getSiteSettings,getPublicSiteSettings,listData} from '../api';
import {Empty,LoadingPage} from './AdminPrimitives';
import {Photo} from '../public/PremiumUI';
import {usePhotoPlaceholders} from '../public/usePhotoPlaceholders';
import {boxFromDescription,withoutBoxLine,validateBoxParameters,isBoxConfigured,formatBoxLine} from '../participant/box-parameters';
import {allocateAmplifierLinks} from '../participant/amplifier-links';
import {diffConfigurationVersions} from '../participant/configuration-diff';
import {availableCatalogModels,catalogCategoryForEquipment,isApprovedCatalogModel,findUnapprovedEquipmentRow,findUnapprovedBatteryRow} from '../participant/component-catalog-rules';
import {validateConfigurationQuantities} from '../participant/configuration-quantity';

const typeName:Record<string,string>={SUBWOOFER:'Сабвуфер',MIDBASS:'Мидбас',MIDRANGE:'Среднечастотник',HORN:'Рупор',OTHER:'Другое'};
const DEFAULT_VIBRATION_BRANDS=['STP','ComfortMat','Audior','Global'];
export function ConfigurationsPage({carId,go,admin=false,LoadingPage,displayCarName}:{carId:string;go:(path:string)=>void;admin?:boolean;LoadingPage:React.ComponentType<any>;displayCarName:(car:any,fallback?:string)=>string}){
 const[car,setCar]=useState<any|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const backPath=admin?'/admin/cars':'/participant?tab=cars';
 useEffect(()=>{let cancelled=false;(async()=>{setLoading(true);setError('');try{const response=await apiGet<any>(admin?'/cars':'/participants/me/cars');const rows=listData<any>(response);const found=rows.find((item:any)=>item.id===carId);if(!found)throw new Error('Автомобиль не найден');if(!cancelled)setCar(found)}catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Не удалось загрузить автомобиль')}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true}},[carId,admin]);
 return <div className={"participant-portal configurations-page-shell"+(admin?" admin-configurations-shell":" usd-member")}>{admin&&<header className="participant-portal-header"><div className="participant-portal-brand"><span className="brand-mark">USD</span><div><strong>Управление автомобилями</strong><small>Ultimate Sound Destruction</small></div></div><div className="participant-header-actions"><button className="secondary-button compact" onClick={()=>go(backPath)}>Все автомобили</button></div></header>}<div className={admin?"participant-portal-main":"configurations-embedded-content"}>{error&&<div className="notice"><AlertTriangle size={16}/><span>{error}</span><button className="secondary-button compact" onClick={()=>go(backPath)}>К автомобилям</button></div>}{loading?<LoadingPage/>:car&&<ConfigurationsWorkspace car={car} canEdit={true} admin={admin} onBack={()=>go(backPath)} displayCarName={displayCarName}/>}</div></div>;
}

function ConfigurationsWorkspace({car,canEdit,admin,onBack,displayCarName}:{car:any;canEdit:boolean;admin:boolean;onBack:()=>void;displayCarName:(car:any,fallback?:string)=>string}){
 const [configs,setConfigs]=useState<any[]>(car.configurations??[]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[editing,setEditing]=useState<any|null>(null),[details,setDetails]=useState<any|null>(null),[versionBusy,setVersionBusy]=useState(false);
 const load=async()=>{setLoading(true);setError('');try{setConfigs(listData(await apiGet<any>('/cars/'+car.id+'/configurations')))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки конфигураций')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[car.id]);
 const open=async(id:string)=>{try{setDetails(await apiGet<any>('/configurations/'+id))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки конфигурации')}};
 const createVersion=async(id:string)=>{setVersionBusy(true);setError('');try{await apiPost('/configurations/'+id+'/versions',{});await load();await open(id)}catch(e){setError(e instanceof Error?e.message:'Не удалось создать новую версию')}finally{setVersionBusy(false)}};
 if(editing!==null)return <div className="configurations-page"><ConfigurationEditor carId={car.id} configuration={editing} car={car} admin={admin} onClose={()=>setEditing(null)} onSaved={async()=>{setEditing(null);await load()}}/></div>;
 if(details)return <div className="configurations-page"><ConfigurationDetails configuration={details} admin={admin} onClose={()=>setDetails(null)} onEdit={canEdit?()=>{setDetails(null);setEditing(details)}:undefined}/></div>;
 return <div className="configurations-page">
  <div className="configurations-page-top"><button className="registration-back-link" onClick={onBack}><ChevronLeft size={16}/>Назад к автомобилям</button><span className="eyebrow">ГАРАЖ USD / КОНФИГУРАЦИИ</span><h1>{admin?'Конфигурации автомобиля':'Оборудование автомобиля'}</h1><p>{admin?'Управляйте составом оборудования и сохраняйте изменения отдельными версиями.':'Конфигурация — сохранённый состав аудиосистемы. Выберите существующую или создайте новую для этого автомобиля.'}</p></div>
  <div className="config-modal">
   <div className="config-modal-hero"><div className="config-car-icon"><CarFront size={22}/></div><div><span className="eyebrow">КОНФИГУРАЦИИ АВТОМОБИЛЯ</span><h2>{displayCarName(car)}</h2><p>{car.registrationNumber||'Без госномера'}{car.participant?' · '+[car.participant.lastName,car.participant.firstName].filter(Boolean).join(' '):''}</p></div><div className="config-count"><strong>{configs.length}</strong><span>{configs.length===1?'конфигурация':'конфигурации'}</span></div></div>
   {error&&<div className="notice"><AlertTriangle size={16}/><span>{error}</span></div>}
   {loading?<LoadingPage small/>:<>{!configs.length?<div className="config-empty"><div className="config-empty-icon"><Settings2 size={22}/></div><strong>Конфигураций пока нет</strong><span>Создайте первую конфигурацию, чтобы сохранить состав оборудования автомобиля.</span></div>:<div className="config-list">{configs.map(c=><article className="config-card" key={c.id}><div className="config-card-main"><div className="config-version"><span>АКТУАЛЬНАЯ</span><b>v{c.currentVersion}</b></div><div><h3>{c.name}</h3><p>{(c.versions?.find((version:any)=>version.version===c.currentVersion)??c.versions?.[0])?.additionalDescription||'Описание конфигурации не добавлено'}</p></div></div><div className="config-card-actions"><button className="secondary-button compact" onClick={()=>void open(c.id)}><Info size={14}/>Подробнее</button>{canEdit&&<><button className="secondary-button compact" onClick={()=>setEditing(c)}><Pencil size={14}/>Редактировать</button><button className="primary-button compact" disabled={versionBusy} onClick={()=>void createVersion(c.id)}><Plus size={14}/>Новая версия</button></>}</div></article>)}</div>}{canEdit&&<button className="config-create-button" onClick={()=>setEditing({})}><span><Plus size={18}/></span><div><strong>Создать конфигурацию</strong><small>Сохранить оборудование и текущую сборку автомобиля</small></div><ChevronRight size={18}/></button>}</>}
  </div>
 </div>
}

export function ConfigurationEditor({carId,configuration,car,admin,onClose,onSaved,saveOverride,historicalFinal=false}:{carId:string;configuration:any;car?:any;admin:boolean;onClose:()=>void;onSaved:()=>Promise<void>;saveOverride?:(body:any)=>Promise<void>;historicalFinal?:boolean}){
 const photoPlaceholders=usePhotoPlaceholders();
 const isNew=!configuration.id,initial=configuration.versions?.find((x:any)=>x.version===configuration.currentVersion)||configuration.versions?.[0]||{};
 const [v,setV]=useState<any>({name:configuration.name??'',vibrationIsolation:initial.vibrationIsolation??'',additionalDescription:withoutBoxLine(initial.additionalDescription??''),headUnits:(initial.headUnits??[]).map((x:any)=>({...x})),audioComponents:(initial.audioComponents??[]).map((x:any)=>({...x})),amplifiers:(initial.amplifiers??[]).map((x:any)=>({...x,componentLinks:(x.componentLinks??[]).map((l:any)=>({...l,componentId:String((initial.audioComponents??[]).findIndex((ac:any)=>ac.id===l.componentId))}))})),batteries:(initial.batteries??[]).map((x:any)=>({...x})),generators:(initial.generators??[]).map((x:any)=>({...x}))});
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const [box,setBox]=useState(()=>boxFromDescription(initial.additionalDescription??''));

 const [activeView,setActiveView]=useState<'SUB'|'FRONT'|'REAR'|'POWER'|'BOX'|'NOTES'|'SETUP'>(isNew?'SETUP':'SUB');
 const [actionsOpen,setActionsOpen]=useState(false);
 const [picker,setPicker]=useState<null|{kind:'audioComponents'|'amplifiers'|'headUnits';direction:'SUB'|'FRONT'|'REAR';type:string;brand:string;model:string;quantity:number}>(null);
 const [modelQuery,setModelQuery]=useState('');

 const configuredIn=(direction:'SUB'|'FRONT'|'REAR')=>v.audioComponents.filter((x:any)=>x.direction===direction&&String(x.brand??'').trim()&&String(x.model??'').trim()&&Number.isSafeInteger(Number(x.quantity))&&Number(x.quantity)>0&&(direction!=='SUB'||x.type==='SUBWOOFER')).length;
 const editorViews=[{key:'SUB',label:'Басовая система',short:'Бас',icon:Volume2,desc:'Сабвуферы и усилители для SPL, BassRace и Storm Wall.'},
 {key:'FRONT',label:'Фронтальная система',short:'Фронт',icon:Gauge,desc:'Акустика спереди и усилители для BFSPL.'},
 {key:'REAR',label:'Тыловая система',short:'Тыл',icon:Volume2,desc:'Акустика сзади и усилители для BDW SPL.'},
 {key:'POWER',label:'Питание',short:'Питание',icon:BatteryCharging,desc:'Тип, количество и ток аккумуляторов и генераторов.'},
 {key:'BOX',label:'Короб',short:'Короб',icon:Layers3,desc:'Дополнительные параметры басового короба: тип, литры и герцы.'},
 {key:'NOTES',label:'Описание',short:'Описание',icon:FileText,desc:'Необязательно: проводка, установка и пояснения для судей.'},
 {key:'SETUP',label:'Общие настройки',short:'Общее',icon:Settings2,desc:'Название и виброизоляция'}] as const;
 const selectedView=editorViews.find(item=>item.key===activeView)!;
 const viewIsReady=(key:string)=>key==='SUB'||key==='FRONT'||key==='REAR'?configuredIn(key as 'SUB'|'FRONT'|'REAR')>0:key==='POWER'?(v.batteries.length+v.generators.length)>0:key==='BOX'?isBoxConfigured(box):key==='NOTES'?Boolean(v.additionalDescription.trim()):Boolean(v.name.trim());
 const openPicker=(kind:'audioComponents'|'amplifiers'|'headUnits',direction:'SUB'|'FRONT'|'REAR')=>{
  setModelQuery('');setPicker({kind,direction,type:direction==='SUB'?'SUBWOOFER':'MIDBASS',brand:'',model:'',quantity:1});setActionsOpen(false);
 };
 const addEquipmentForView=()=>{if(activeView==='SUB'||activeView==='FRONT'||activeView==='REAR')openPicker('audioComponents',activeView);else if(activeView==='POWER'){if(defaultBatteryCode)add('batteries',{brand:defaultBatteryCode,model:'100',quantity:1});else setError('Справочник аккумуляторов недоступен. Повторите попытку после загрузки каталога.');}else setActiveView('SUB');setActionsOpen(false)};

 const [requestOpen,setRequestOpen]=useState(false),[requestCategory,setRequestCategory]=useState('AUDIO_COMPONENT'),[requestBrand,setRequestBrand]=useState(''),[requestModel,setRequestModel]=useState(''),[requestDetails,setRequestDetails]=useState(''),[requestBusy,setRequestBusy]=useState(false),[requestNotice,setRequestNotice]=useState('');
 const [catalogs,setCatalogs]=useState<any>({vibrationBrands:DEFAULT_VIBRATION_BRANDS,componentBrands:[],componentModels:[],batteryTypes:[]});
 const [catalogStatus,setCatalogStatus]=useState<'loading'|'ready'|'error'>('loading'),[catalogReload,setCatalogReload]=useState(0);
 useEffect(()=>{let cancelled=false;setCatalogStatus('loading');
  (admin?getSiteSettings():getPublicSiteSettings()).then(r=>{
   const c=r?.settings?.catalogs;
   if(!c||!Array.isArray(c.componentModels)||!Array.isArray(c.batteryTypes))throw new Error('Каталоги отсутствуют в ответе API');
   if(!cancelled){setCatalogs({vibrationBrands:Array.isArray(c.vibrationBrands)?c.vibrationBrands:DEFAULT_VIBRATION_BRANDS,componentBrands:Array.isArray(c.componentBrands)?c.componentBrands:[],componentModels:c.componentModels,batteryTypes:c.batteryTypes});setCatalogStatus('ready')}
  }).catch(()=>{if(!cancelled)setCatalogStatus('error')});
  return()=>{cancelled=true};
 },[admin,catalogReload]);

 const batteryTypes=(catalogs.batteryTypes??[]).filter((x:any)=>x.isActive!==false);
 const defaultBatteryCode=batteryTypes[0]?.code??'';
 const activeModels=(kind:'audioComponents'|'amplifiers'|'headUnits',type?:string)=>availableCatalogModels(catalogs.componentModels,kind,type);
 const pickerBrands=picker?[...new Set<string>(activeModels(picker.kind,picker.type).map((x:any)=>String(x.brand)))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'ru')):[];
 const pickerModels=picker?activeModels(picker.kind,picker.type).filter((x:any)=>x.brand===picker.brand&&String(x.model).toLowerCase().includes(modelQuery.trim().toLowerCase())):[];
 const savePicker=()=>{if(!picker)return;if(catalogStatus!=='ready'){setError('Сначала загрузите справочник моделей оборудования.');return}const approved=isApprovedCatalogModel(catalogs.componentModels,picker.kind,picker);
   const entry=activeModels(picker.kind,picker.type).find((model:any)=>model.brand===picker.brand&&model.model===picker.model&&model.id);
  if(!approved||!entry){setError('Выберите модель с ID из каталога USD. Если её нет, отправьте запрос администратору.');return}
  if(!Number.isSafeInteger(picker.quantity)||picker.quantity<1||picker.quantity>99){setError('Укажите целое количество оборудования от 1 до 99.');return}
  add(picker.kind,{catalogEntryId:String(entry.id),brand:picker.brand,model:picker.model,quantity:picker.quantity,direction:picker.direction,...(picker.kind==='audioComponents'?{type:picker.type}:{}),...(picker.kind==='amplifiers'?{componentLinks:[]}: {})});
  setPicker(null);setError('');
 };
 const brandOptions=(cat:string,current:string,type?:string)=>{const wanted=cat==='AUDIO_COMPONENT'&&type==='SUBWOOFER'?'SUBWOOFER':cat;const values=catalogs.componentBrands.filter((x:any)=>x.category===wanted&&x.isActive!==false).map((x:any)=>String(x.name));return [...new Set<string>(current&&!values.includes(current)?[current,...values]:values)].sort((a:string,b:string)=>a.localeCompare(b,'ru'))};
 const modelOptions=(cat:string,currentBrand:string,currentModel:string,type?:string)=>{const wanted=cat==='AUDIO_COMPONENT'&&type==='SUBWOOFER'?'SUBWOOFER':cat;const values=catalogs.componentModels.filter((x:any)=>x.category===wanted&&x.brand===currentBrand&&x.isActive!==false).map((x:any)=>String(x.model));return [...new Set<string>(currentModel&&!values.includes(currentModel)?[currentModel,...values]:values)].sort((a:string,b:string)=>a.localeCompare(b,'ru'))};
 const modelLabel=(cat:string,brand:string,model:string)=>{const item=catalogs.componentModels.find((x:any)=>(x.category===cat||(cat==='AUDIO_COMPONENT'&&x.category==='SUBWOOFER'))&&x.brand===brand&&String(x.model)===model);return item?.lifecycle==='DISCONTINUED'?`${model} · снята с производства`:model};
 const submitCatalogRequest=async()=>{setRequestBusy(true);setError('');setRequestNotice('');try{const result=await apiPost<any>('/component-catalog-requests',{category:requestCategory,brand:requestBrand.trim(),model:requestModel.trim(),details:requestDetails.trim()});setRequestNotice(result?.message??'Запрос отправлен администратору.');setRequestBrand('');setRequestModel('');setRequestDetails('');setRequestOpen(false)}catch(e){setError(e instanceof Error?e.message:'Не удалось отправить запрос')}finally{setRequestBusy(false)}};
 const directions=['FRONT','REAR','SUB'],types=['SUBWOOFER','MIDBASS','MIDRANGE','HORN','OTHER'];
 const directionName:Record<string,string>={FRONT:'Фронт',REAR:'Тыл',SUB:'Сабвуфер'};

 const patch=(key:string,i:number,p:any)=>setV((s:any)=>({...s,[key]:s[key].map((x:any,n:number)=>n===i?{...x,...p}:x)}));
 const remove=(key:string,i:number)=>setV((s:any)=>{
  if(key==='audioComponents'){
   const audioComponents=s.audioComponents.filter((_:any,n:number)=>n!==i);
   const amplifiers=s.amplifiers.map((amplifier:any)=>({...amplifier,componentLinks:(amplifier.componentLinks??[])
    .filter((link:any)=>String(link.componentId)!==String(i))
    .map((link:any)=>({...link,componentId:Number(link.componentId)>i?String(Number(link.componentId)-1):String(link.componentId)}))}));
   return {...s,audioComponents,amplifiers};
  }
  return {...s,[key]:s[key].filter((_:any,n:number)=>n!==i)};
 });
 const add=(key:string,item:any)=>setV((s:any)=>({...s,[key]:[...s[key],item]}));

 const validateCatalog=()=>{
  if(catalogStatus!=='ready'){setError('Справочники оборудования не загружены. Проверьте соединение и повторите загрузку каталога.');return false}
  for(const [key,category] of [['headUnits','HEAD_UNIT'],['audioComponents','AUDIO_COMPONENT'],['amplifiers','AMPLIFIER']] as const){
   const invalid=findUnapprovedEquipmentRow(catalogs.componentModels,key,v[key],initial[key]);
   if(invalid){
    const brand=String(invalid.brand??'').trim(),model=String(invalid.model??'').trim();
    setError('Модель «'+(model||'не указана')+'» не найдена в каталоге USD. Выберите существующую модель или запросите добавление.');
    setRequestCategory(category);setRequestBrand(brand);setRequestModel(model);setRequestOpen(true);return false;
   }
  }
  const invalidBattery=findUnapprovedBatteryRow(catalogs.batteryTypes,v.batteries,initial.batteries);
  if(invalidBattery){
   setActiveView('POWER');
   setError('Тип аккумулятора «'+String(invalidBattery.brand??'не указан')+'» отсутствует в активном справочнике USD. Выберите доступный тип. Исторические аккумуляторы можно сохранить только без изменений.');
   return false;
  }
  return true;
 };
 const submit=async()=>{setError('');const quantityError=validateConfigurationQuantities(v);if(quantityError){setError(quantityError);return}if(!validateCatalog())return;
  const boxError=validateBoxParameters(box);if(boxError){setActiveView('BOX');setError(boxError);return}
  setSaving(true);try{
   const boxLine=formatBoxLine(box);
   const body=cleanConfig({...v,additionalDescription:boxLine+v.additionalDescription},catalogs.componentModels);if(saveOverride)await saveOverride(body);else if(isNew)await apiPost('/cars/'+carId+'/configurations',body);else await apiPut('/configurations/'+configuration.id,body);await onSaved()}catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения конфигурации')}finally{setSaving(false)}};
 return <div className="configuration-editor-page" data-member-view={admin?undefined:activeView}><header className="configuration-subpage-header"><button type="button" className="registration-back-link" onClick={onClose}><ChevronLeft size={16}/>{historicalFinal?'Вернуться в кабинет':'К конфигурациям автомобиля'}</button><span className="eyebrow">ГАРАЖ USD / КОНФИГУРАЦИИ</span><h1>{historicalFinal?'Ваша конфигурация на финале 2026':isNew?'Новая конфигурация':admin?'Новая версия · '+configuration.name:selectedView.label}</h1><p>{historicalFinal?'Укажите оборудование, с которым вы выступали 12 сентября 2026 в Волгограде. Сохраним отдельную версию с вашим подтверждением. Исходная запись останется в истории.':isNew?'Опишите оборудование и текущую сборку автомобиля.':admin?'Сохраните изменения отдельной версией — история предыдущей сборки останется доступной.':selectedView.desc}</p></header>{catalogStatus==='error'&&<div className="notice" role="alert"><AlertTriangle size={16}/><span>Справочники USD не загрузились. Сохранение временно недоступно, введённые данные остаются в форме.</span><button type="button" className="secondary-button compact" onClick={()=>setCatalogReload(n=>n+1)}>Повторить загрузку</button></div>}
  {!admin&&<section className="member-config-experience" aria-label="Конфигурация оборудования">
    <div className="member-config-vehicle">
      <div className="member-config-vehicle-info"><span className="eyebrow">МОЙ АВТОМОБИЛЬ</span><h2>{[car?.brand,car?.model].filter(Boolean).join(' ')||configuration.name||'Мой автомобиль'}</h2><p>{car?.registrationNumber||'Соревновательная конфигурация'}{car?.color?' · '+car.color:''}</p>
        <div className="member-config-vehicle-chips"><span>Версия {configuration.currentVersion||1}</span><span>Компоненты: {v.audioComponents.length}</span><span>Усилители: {v.amplifiers.length}</span></div>
      </div>
      <button type="button" className="member-config-actions-button" aria-label="Действия с оборудованием" aria-haspopup="dialog" aria-expanded={actionsOpen} onClick={()=>setActionsOpen(true)}><MoreHorizontal size={19}/><span>Действия</span></button><div className="member-config-vehicle-visual"><Photo src={car?.photoUrl} placeholderSrc={photoPlaceholders.car} alt={[car?.brand,car?.model].filter(Boolean).join(' ')||'Автомобиль USD'} className="member-config-auto-art" fallback={<CarFront size={92} strokeWidth={.85} aria-hidden="true"/>}/><span><CheckCircle2 size={14}/> Актуальная сборка</span></div>
    </div>

    <nav className="member-config-directions" aria-label="Разделы конфигуратора">{editorViews.map(({key,short,icon:Icon})=><button key={key} data-section={key} type="button" aria-pressed={activeView===key} className={activeView===key?'is-active':''} onClick={()=>setActiveView(key)}><Icon size={17}/><span>{short}</span>{viewIsReady(key)&&<i aria-label="Заполнено"/>}</button>)}</nav>
    <div className="member-config-readiness"><span><span className={viewIsReady(activeView)?'ready-dot':'pending-dot'}/>{activeView==='SUB'?'SPL / BassRace / Storm Wall':activeView==='FRONT'?'BFSPL':activeView==='REAR'?'BDW SPL':selectedView.label}</span><strong>{viewIsReady(activeView)?'Заполнено':activeView==='SETUP'?'Укажите название':['SUB','FRONT','REAR'].includes(activeView)?'Не заполнено':'Необязательно'}</strong></div>
    {picker&&!admin&&<div className="member-config-picker-overlay" role="presentation" onClick={()=>setPicker(null)}>
      <section className="member-config-picker-screen" role="dialog" aria-modal="true" aria-label="Добавить оборудование" onClick={e=>e.stopPropagation()}>
       <div className="member-config-picker-title"><div><span className="eyebrow">КАТАЛОГ USD / {picker.direction}</span><h2>Добавить оборудование</h2><p>Выберите бренд и модель. Если нужной модели нет, запросите её добавление.</p></div><button aria-label="Закрыть выбор оборудования" type="button" onClick={()=>setPicker(null)}><X size={20}/></button></div>
       <div className="member-config-picker-body"><div className="member-config-picker-fields">
        <label>Тип оборудования<select value={picker.kind} onChange={e=>{const kind=e.target.value as 'audioComponents'|'amplifiers'|'headUnits';setPicker({...picker,kind,brand:'',model:''});setModelQuery('')}}><option value="audioComponents">{picker.direction==='SUB'?'Сабвуфер':'Акустика'}</option><option value="amplifiers">Усилитель</option><option value="headUnits">Головное устройство</option></select></label>
        <label>Бренд<select value={picker.brand} disabled={catalogStatus!=='ready'} onChange={e=>{setPicker({...picker,brand:e.target.value,model:''});setModelQuery('')}}><option value="">Выберите бренд</option>{pickerBrands.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
        <label>Поиск модели<input value={modelQuery} type="search" placeholder="Название модели" onChange={e=>{setModelQuery(e.target.value);setPicker({...picker,model:''})}}/></label>
       </div>
       {catalogStatus==='loading'&&<p className="field-help" role="status">Загружаем справочник оборудования USD…</p>}
       {catalogStatus==='error'&&<div className="notice" role="alert">Не удалось загрузить справочник. Проверьте интернет и повторите попытку. <button type="button" className="secondary-button compact" onClick={()=>setCatalogReload(n=>n+1)}>Повторить загрузку</button></div>}
       {catalogStatus==='ready'&&pickerBrands.length===0&&<p className="field-help">В этой категории пока нет опубликованных моделей. Отправьте запрос на добавление.</p>}
       <div className="member-config-picker-list" aria-label="Модели из каталога">
        {catalogStatus!=='ready'?<p>Выбор моделей будет доступен после загрузки справочника.</p>:!picker.brand?<p>Сначала выберите бренд.</p>:pickerModels.length?pickerModels.map((item:any)=><button className={picker.model===item.model?'selected':''} key={item.id??item.model} onClick={()=>setPicker({...picker,model:String(item.model)})} type="button"><Database size={23}/><span><strong>{item.brand} {item.model}</strong><small>{item.lifecycle==='DISCONTINUED'?'Снята с производства':'Модель каталога USD'}</small></span><CheckCircle2 size={18}/></button>):<p>Модели не найдены. Можно запросить добавление в каталог.</p>}
       </div>
       <button type="button" className="member-config-picker-request" onClick={()=>{setRequestCategory(catalogCategoryForEquipment(picker.kind,picker.type));setRequestBrand(picker.brand);setRequestModel(modelQuery);setRequestOpen(true);setPicker(null)}}>Нет нужной модели? Отправить запрос <ChevronRight size={16}/></button></div>
       <div className="member-config-picker-foot"><label>Количество <input type="number" min="1" max="99" step="1" value={picker.quantity} onChange={e=>setPicker({...picker,quantity:Math.min(99,Math.max(1,Math.trunc(Number(e.target.value))||1))})}/></label><button type="button" className="primary-button" disabled={catalogStatus!=='ready'||!picker.model} onClick={savePicker}><Plus size={17}/>Добавить {picker.direction==='SUB'?'в бас':picker.direction==='FRONT'?'во фронт':'в тыл'}</button></div>
      </section></div>}
    {actionsOpen&&<div className="member-config-actions-overlay" role="presentation" onClick={()=>setActionsOpen(false)}><section role="dialog" aria-modal="true" aria-label="Действия с конфигурацией" className="member-config-actions-sheet" onClick={e=>e.stopPropagation()}><div className="member-config-sheet-top"><h2>Действия</h2><button type="button" aria-label="Закрыть меню действий" onClick={()=>setActionsOpen(false)}><X size={20}/></button></div>
      <button type="button" onClick={addEquipmentForView}><Plus size={20}/><span><strong>Добавить оборудование</strong><small>Выбрать модель из каталога USD</small></span><ChevronRight size={17}/></button>
      <button type="button" onClick={()=>{setRequestOpen(true);setActionsOpen(false)}}><Database size={20}/><span><strong>Запросить модель в каталог</strong><small>Отправить заявку администратору USD</small></span><ChevronRight size={17}/></button>
      <button type="button" onClick={()=>{setActiveView('SETUP');setActionsOpen(false)}}><Pencil size={20}/><span><strong>Изменить параметры</strong><small>Название конфигурации и виброизоляция</small></span><ChevronRight size={17}/></button>
      <button type="button" onClick={()=>{setActiveView('NOTES');setActionsOpen(false)}}><FileText size={20}/><span><strong>Описание системы</strong><small>Дополнительные сведения для судей</small></span><ChevronRight size={17}/></button>
      {!isNew&&!historicalFinal&&<div className="member-config-version-note"><Layers3 size={18}/><span>При сохранении автоматически создаётся новая версия. Предыдущая сборка останется в истории.</span></div>}
      <button type="button" onClick={()=>{setActionsOpen(false);onClose()}}><Layers3 size={20}/><span><strong>Версии и история</strong><small>Вернуться к сохранённым конфигурациям</small></span><ChevronRight size={17}/></button>
    </section></div>}
  </section>}
  {error&&<div className="form-error" role="alert"><AlertTriangle size={16}/>{error}</div>}
  <div className="form config-editor">
   <div className="config-editor-intro"><div className="config-editor-icon"><Settings2 size={20}/></div><div><span className="eyebrow">{isNew?'НОВАЯ КОНФИГУРАЦИЯ':'НОВАЯ ВЕРСИЯ'}</span><strong>{historicalFinal?'Уточните сборку именно на день финала 2026':isNew?'Опишите текущую сборку автомобиля':'Сохраните изменения отдельной версией — история предыдущей сборки не потеряется.'}</strong></div></div>
   {!historicalFinal&&<div className="configuration-admission-guide"><strong>Что нужно заполнить для допуска к направлениям</strong><ul><li><b>SUB · Сабвуфер</b> — для всех классов направлений SPL, BassRace и Hurrican добавьте компонент типа «Сабвуфер» с направлением «Сабвуфер».</li><li><b>FRONT · Фронт</b> — для BFSPL добавьте хотя бы один аудиокомпонент с направлением «Фронт».</li><li><b>REAR · Тыл</b> — для BDW добавьте хотя бы один аудиокомпонент с направлением «Тыл».</li></ul><small>При регистрации система проверит конфигурацию автоматически. Изменения сохраняются отдельной версией, прошлые выступления не переписываются.</small></div>}
   <div className="catalog-request-inline"><button type="button" className="secondary-button compact" onClick={()=>setRequestOpen(x=>!x)}><Plus size={14}/>{requestOpen?'Скрыть форму запроса':'Не нашли комплектующее? Запросить добавление'}</button>{requestNotice&&<div className="notice">{requestNotice}</div>}{requestOpen&&<div className="catalog-request-form" role="dialog" aria-modal={!admin} aria-label="Запрос новой модели в каталог"><strong>Запрос нового комплектующего</strong><p className="field-help">Укажите точную модель. Администратор получит письмо и рассмотрит заявку; после добавления мы пришлём вам уведомление.</p><div className="config-basic-grid"><label>Категория<select value={requestCategory} onChange={e=>setRequestCategory(e.target.value)}><option value="HEAD_UNIT">Головное устройство</option><option value="AUDIO_COMPONENT">Акустика и динамики</option><option value="AMPLIFIER">Усилитель</option><option value="SUBWOOFER">Сабвуфер</option><option value="DSP">Процессор / DSP</option></select></label><label>Бренд<input value={requestBrand} onChange={e=>setRequestBrand(e.target.value)} maxLength={100} placeholder="Например, Deaf Bonce" required/></label><label>Модель<input value={requestModel} onChange={e=>setRequestModel(e.target.value)} maxLength={160} placeholder="Точное название модели" required/></label></div><label>Комментарий (необязательно)<textarea rows={2} value={requestDetails} onChange={e=>setRequestDetails(e.target.value)} maxLength={1000} placeholder="Год выпуска, характеристики, ссылка на производителя…"/></label><div className="page-actions"><button type="button" className="primary-button compact" disabled={requestBusy||!requestBrand.trim()||!requestModel.trim()} onClick={()=>void submitCatalogRequest()}>{requestBusy?'Отправляем…':'Отправить запрос'}</button><button type="button" className="secondary-button compact" onClick={()=>setRequestOpen(false)}>Отмена</button></div></div>}</div>
   <div className="config-basic-grid"><label>Название конфигурации<input readOnly={historicalFinal} value={v.name} onChange={e=>setV({...v,name:e.target.value})} placeholder="Например: Сезон 2026 · Stage 2" required/></label><label>Виброизоляция<select value={v.vibrationIsolation} onChange={e=>setV({...v,vibrationIsolation:e.target.value})}><option value="">Не указана</option>{[...new Set<string>([...(catalogs.vibrationBrands??[]),...(v.vibrationIsolation&&!catalogs.vibrationBrands.includes(v.vibrationIsolation)?[v.vibrationIsolation]:[])])].map((x:string)=><option key={x} value={x}>{x}</option>)}</select><small className="field-help">Выберите марку из справочника «Виброизоляция».</small></label></div>
   <div className="member-config-description"><label>Описание<textarea rows={5} value={v.additionalDescription} onChange={e=>setV({...v,additionalDescription:e.target.value})} placeholder="Опишите питание, короб, установку, настройку и особенности системы для судей…"/></label>{!admin&&<p className="member-config-notes-hint">Например: тип и объём короба, настройка в Гц, схема питания и проводки. Это описание сохраняется в версии конфигурации.</p>}</div>
   <div className="member-config-box"><div className="member-config-box-intro"><span className="eyebrow">БАСОВАЯ СИСТЕМА / КОРОБ</span><h3>Параметры короба</h3><p>Необязательно, если короб отсутствует. Для сохранения укажите полный набор параметров.</p></div><div className="member-config-box-fields"><label>Тип короба<select value={box.type} onChange={e=>setBox(x=>({...x,type:e.target.value}))}><option value="ФИ">Фазоинвертор (ФИ)</option><option value="ЗЯ">Закрытый ящик (ЗЯ)</option><option value="ЧВ">Четвертьволновик (ЧВ)</option><option value="БП">Бандпасс (БП)</option><option value="Другое">Другое</option></select></label><label>Объём, л<input type="text" inputMode="decimal" autoComplete="off" value={box.volume} onChange={e=>setBox(x=>({...x,volume:e.target.value}))} placeholder="Например, 180"/></label><label>Настройка, Гц<input type="text" inputMode="decimal" autoComplete="off" value={box.tuning} onChange={e=>setBox(x=>({...x,tuning:e.target.value}))} placeholder="Например, 32"/></label></div></div>
    <div className="member-config-headunits"><ConfigListEditor member={!admin} title="Головные устройства" icon={Database} items={v.headUnits} onAdd={()=>admin?add('headUnits',{brand:'',model:'',direction:'FRONT'}):openPicker('headUnits','FRONT')} onRemove={i=>remove('headUnits',i)}>{(x:any,i:number)=><div className="form-grid-3"><><input value={x.brand} list={'head-unit-brand-'+i} onChange={e=>patch('headUnits',i,{brand:e.target.value,model:''})} placeholder="Марка" aria-label="Марка головного устройства"/><datalist id={'head-unit-brand-'+i}>{brandOptions('HEAD_UNIT',x.brand).map((b:string)=><option key={b} value={b}/>)}</datalist></><><input value={x.model} list={'head-unit-model-'+i} onChange={e=>patch('headUnits',i,{model:e.target.value})} placeholder="Модель" aria-label="Модель головного устройства"/><datalist id={'head-unit-model-'+i}>{modelOptions('HEAD_UNIT',x.brand,x.model).map((m:string)=><option key={m} value={m}/>)}</datalist></><select value={x.direction} onChange={e=>patch('headUnits',i,{direction:e.target.value})}>{directions.map(d=><option key={d} value={d}>{directionName[d]}</option>)}</select></div>}</ConfigListEditor></div>
   {(['FRONT','SUB','REAR'] as const).map(direction=><div className="config-direction-workspace" data-direction={direction} key={direction}><div className="config-direction-workspace-head"><span className="config-direction-step">{direction==='FRONT'?'01':direction==='SUB'?'02':'03'}</span><div><strong>{direction==='FRONT'?'Фронтальная сцена':direction==='SUB'?'Басовая секция':'Тыловая сцена'}</strong><small>{direction==='FRONT'?'Акустика и усиление для BFSPL':direction==='SUB'?'Сабвуферы и усиление для SPL · BassRace · Storm Wall':'Акустика и усиление для BDW'}</small></div><span className="config-direction-code">{direction}</span></div><ConfigDirectionListEditor member={!admin} key={direction} title={direction==='FRONT'?'Фронтальная акустика':direction==='SUB'?'Басовая секция · сабвуферы':'Тыловая акустика'} subtitle={direction==='FRONT'?'BFSPL · фронтальная сцена':direction==='SUB'?'SPL · BassRace · Storm Wall':'BDW · тыловая сцена'} icon={Activity} direction={direction} items={v.audioComponents} onAdd={()=>admin?add('audioComponents',{brand:'',model:'',quantity:'',type:direction==='SUB'?'SUBWOOFER':'MIDBASS',direction}):openPicker('audioComponents',direction)} onRemove={i=>remove('audioComponents',i)}>{(x:any,i:number)=><div className="form-grid-4"><><input value={x.brand} list={'audio-brand-'+i} onChange={e=>patch('audioComponents',i,{brand:e.target.value,model:''})} placeholder="Марка" aria-label="Марка аудиокомпонента"/><datalist id={'audio-brand-'+i}>{brandOptions('AUDIO_COMPONENT',x.brand,x.type).map((b:string)=><option key={b} value={b}/>)}</datalist></><><input value={x.model} list={'audio-model-'+i} onChange={e=>patch('audioComponents',i,{model:e.target.value})} placeholder="Модель" aria-label="Модель аудиокомпонента"/><datalist id={'audio-model-'+i}>{modelOptions('AUDIO_COMPONENT',x.brand,x.model,x.type).map((m:string)=><option key={m} value={m}/>)}</datalist></><label className="inline-field-label">{direction==='FRONT'?'Количество динамиков в замеряемой двери':direction==='REAR'?'Общее количество динамиков на тыловую систему':'Общее количество сабвуферов в системе'}<input type="text" inputMode="numeric" pattern="[0-9]*" value={x.quantity??''} onChange={e=>patch('audioComponents',i,{quantity:e.target.value.replace(/[^0-9]/g,'')})} placeholder="Укажите количество" aria-label={direction==='FRONT'?'Количество динамиков в замеряемой двери':direction==='REAR'?'Общее количество динамиков на тыловую систему':'Общее количество сабвуферов в системе'}/></label><select aria-label="Тип аудиокомпонента" value={x.type} onChange={e=>patch('audioComponents',i,{type:e.target.value})}>{types.map(t=><option key={t} value={t}>{typeName[t]}</option>)}</select></div>}</ConfigDirectionListEditor>
   <ConfigDirectionListEditor member={!admin} key={'amp-'+direction} title={direction==='FRONT'?'Усилители · фронт':direction==='SUB'?'Усилители · бас':'Усилители · тыл'} subtitle="Укажите усилители и при необходимости привяжите их к компонентам этой конфигурации." icon={Gauge} direction={direction} items={v.amplifiers} onAdd={()=>admin?add('amplifiers',{brand:'',model:'',quantity:1,direction,componentLinks:[]}):openPicker('amplifiers',direction)} onRemove={i=>remove('amplifiers',i)}>{(x:any,i:number)=><div><div className="form-grid-3"><><input value={x.brand} list={'amplifier-brand-'+i} onChange={e=>patch('amplifiers',i,{brand:e.target.value,model:''})} placeholder="Марка" aria-label="Марка усилителя"/><datalist id={'amplifier-brand-'+i}>{brandOptions('AMPLIFIER',x.brand).map((b:string)=><option key={b} value={b}/>)}</datalist></><><input value={x.model} list={'amplifier-model-'+i} onChange={e=>patch('amplifiers',i,{model:e.target.value})} placeholder="Модель" aria-label="Модель усилителя"/><datalist id={'amplifier-model-'+i}>{modelOptions('AMPLIFIER',x.brand,x.model).map((m:string)=><option key={m} value={m}/>)}</datalist></><label className="inline-field-label">Количество усилителей<input type="number" min="1" value={x.quantity} onChange={e=>patch('amplifiers',i,{quantity:Number(e.target.value)})}/></label></div></div>}</ConfigDirectionListEditor></div>)}
   <div className="member-config-power"><ConfigListEditor member={!admin} title="Аккумуляторы" icon={Database} items={v.batteries} onAdd={()=>{if(defaultBatteryCode)add('batteries',{brand:defaultBatteryCode,model:'100',quantity:1});else setError('Справочник аккумуляторов недоступен. Повторите попытку после загрузки каталога.')}} onRemove={i=>remove('batteries',i)}>{(x:any,i:number)=><div className="form-grid-3"><select aria-label="Тип аккумулятора" value={x.brand} onChange={e=>patch('batteries',i,{brand:e.target.value})}>{batteryTypes.map((t:any)=><option key={t.code} value={t.code}>{t.name}</option>)}{x.brand&&!batteryTypes.some((t:any)=>t.code===x.brand)&&<option value={x.brand}>{x.brand} · исторический тип</option>}</select><label className="inline-field-label">Номинальный ток, А<input type="number" min="1" max="10000" value={Number.parseInt(String(x.model).replace(/[^0-9]/g,''),10)||''} onChange={e=>patch('batteries',i,{model:e.target.value})} placeholder="80"/></label><label className="inline-field-label">Количество секций<input type="number" min="1" max="100" value={x.quantity} onChange={e=>patch('batteries',i,{quantity:Number(e.target.value)})}/></label></div>}</ConfigListEditor>
   <ConfigListEditor member={!admin} title="Генераторы" icon={Activity} items={v.generators} onAdd={()=>add('generators',{brand:'Генератор',model:'320',quantity:1})} onRemove={i=>remove('generators',i)}>{(x:any,i:number)=><div className="form-grid-3"><label className="inline-field-label">Производитель<input value={x.brand==='Генератор'?'':x.brand??''} onChange={e=>patch('generators',i,{brand:e.target.value})} maxLength={100} placeholder="Например, СтартВОЛЬТ"/></label><label className="inline-field-label">Ток одного генератора, А<input type="number" min="1" max="10000" value={Number.parseInt(String(x.model).replace(/[^0-9]/g,''),10)||''} onChange={e=>patch('generators',i,{model:e.target.value})} placeholder="320"/></label><label className="inline-field-label">Количество генераторов<input type="number" min="1" max="50" value={x.quantity} onChange={e=>patch('generators',i,{quantity:Number(e.target.value)})}/></label></div>}</ConfigListEditor></div>
   <div className="config-editor-actions"><button className="primary-button" disabled={saving||!v.name.trim()} onClick={()=>void submit()}>{saving?<><Loader2 className="spin" size={15}/>Сохраняем…</>:<><Check size={15}/>{historicalFinal?'Подтвердить конфигурацию финала':isNew?'Создать конфигурацию':'Сохранить новую версию'}</>}</button></div>
  </div>
 </div>
}

function EquipmentRow({member,item,index,Icon,onRemove,children}:{member:boolean;item:any;index:number;Icon:any;onRemove:()=>void;children:React.ReactNode}){
 if(!member)return <div className="config-row"><span className="config-row-number">{String(index+1).padStart(2,'0')}</span><div className="config-row-content">{children}</div><button className="icon-button danger" type="button" onClick={onRemove} aria-label="Удалить">×</button></div>;
 const title=[item.brand,item.model].filter(Boolean).join(' ')||'Новое оборудование';
 return <div className="config-row member-equipment-row"><details className="member-equipment-item" open={!item.brand&&!item.model?true:undefined}><summary><span className="member-equipment-icon"><Icon size={21}/></span><span className="member-equipment-copy"><small>{item.type?typeName[item.type]||'Компонент':item.direction?'Направление '+item.direction:'Оборудование'}</small><strong>{title}</strong><span>Параметры и количество</span></span><span className="member-equipment-quantity">{item.quantity??1} шт.</span><ChevronRight size={16}/></summary><div className="config-row-content">{children}<button type="button" className="text-button member-equipment-remove" onClick={onRemove}><X size={14}/>Удалить из системы</button></div></details></div>;
}

function ConfigListEditor({title,icon:Icon,items,onAdd,onRemove,children,member=false}:{member?:boolean;title:string;icon:any;items:any[];onAdd:()=>void;onRemove:(i:number)=>void;children:(x:any,i:number)=>React.ReactNode}){
 return <section className="config-section"><div className="config-section-head"><div className="config-section-title"><span className="config-section-icon"><Icon size={16}/></span><div><strong>{title}</strong><small>{items.length?items.length+' поз.':'Пока пусто'}</small></div></div><button type="button" className="secondary-button compact" onClick={onAdd}><Plus size={13}/>Добавить</button></div>{items.map((x,i)=><EquipmentRow key={x.id??i} member={member} item={x} index={i} Icon={Icon} onRemove={()=>onRemove(i)}>{children(x,i)}</EquipmentRow>)}{!items.length&&<div className="config-section-empty">Добавьте первую позицию</div>}</section>
}

function ConfigDirectionListEditor({title,subtitle,icon:Icon,items,direction,onAdd,onRemove,children,member=false}:{member?:boolean;title:string;subtitle:string;icon:any;items:any[];direction:'FRONT'|'SUB'|'REAR';onAdd:()=>void;onRemove:(i:number)=>void;children:(x:any,i:number)=>React.ReactNode}){
 const rows=items.map((item,index)=>({item,index})).filter(({item})=>item.direction===direction);
 return <section className="config-section config-direction-section" data-direction={direction}><div className="config-section-head"><div className="config-section-title"><span className="config-section-icon"><Icon size={16}/></span><div><strong>{title}</strong><small>{rows.length?rows.length+' поз.':'Пока пусто'} · {subtitle}</small></div></div><button type="button" className="secondary-button compact" onClick={onAdd}><Plus size={13}/>Добавить</button></div>{rows.map(({item,index})=><EquipmentRow key={item.id??index} member={member} item={item} index={index} Icon={Icon} onRemove={()=>onRemove(index)}>{children(item,index)}</EquipmentRow>)}{!rows.length&&<div className="config-section-empty">В этом направлении пока нет оборудования. Нажмите «Добавить», чтобы внести первую позицию.</div>}</section>
}

function cleanConfig(v:any,catalogModels:any[]=[]){
 const audioComponents=(v.audioComponents??[]).map((component:any)=>({...component,quantity:Number(component.quantity)}));
 const amplifierLinks=allocateAmplifierLinks(audioComponents,v.amplifiers??[]);
 const normalized={
  ...v,
  audioComponents,
  batteries:(v.batteries??[]).map((battery:any)=>({...battery,quantity:Number(battery.quantity)})),
  generators:(v.generators??[]).map((generator:any)=>({...generator,quantity:Number(generator.quantity)})),
  amplifiers:(v.amplifiers??[]).map((amplifier:any,index:number)=>({
   ...amplifier,
   quantity:Number(amplifier.quantity),
   componentLinks:amplifierLinks[index]
  }))
 };
 // Resolve stable IDs against the current published catalog. Never trust a stale
 // ID left on an edited row, and never synthesize IDs for unknown models.
 for(const kind of ['headUnits','audioComponents','amplifiers'] as const){
  normalized[kind]=(normalized[kind]??[]).map((row:any)=>{
   const category=catalogCategoryForEquipment(kind,row.type);
   const entry=catalogModels.find((item:any)=>item?.id&&item.isActive!==false&&item.category===category
    &&String(item.brand??'').trim().toLocaleLowerCase('ru')===String(row.brand??'').trim().toLocaleLowerCase('ru')
    &&String(item.model??'').trim().toLocaleLowerCase('ru')===String(row.model??'').trim().toLocaleLowerCase('ru'));
   return {...row,catalogEntryId:entry?String(entry.id):row.catalogEntryId};
  });
 }
 const strip=(x:any):any=>{
  if(Array.isArray(x))return x.map(strip);
  if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x)
   .filter(([k,val])=>!['id','versionId','configurationId','amplifierId','version'].includes(k)&&val!==undefined&&val!==null)
   .map(([k,val])=>[k,k==='componentLinks'&&Array.isArray(val)
    ?(val as any[]).filter((link:any)=>String(link.componentId??'').trim()!=='').map((link:any)=>({componentId:String(link.componentId),quantity:Number(link.quantity)}))
    :strip(val)]));
  return x;
 };
 return strip(normalized);
}

function ConfigurationDetails({configuration,onClose,onEdit,admin=false}:{configuration:any;onClose:()=>void;onEdit?:()=>void;admin?:boolean}){
 const[versionNumber,setVersionNumber]=useState<number>(configuration.currentVersion??configuration.versions?.[0]?.version??1);
 const[compareVersionNumber,setCompareVersionNumber]=useState<number|null>(null);
 const version=configuration.versions?.find((x:any)=>x.version===versionNumber)||configuration.versions?.[0];
 const otherVersions=(configuration.versions??[]).filter((candidate:any)=>candidate.version!==version?.version).sort((a:any,b:any)=>b.version-a.version);
 const comparedVersion=otherVersions.find((candidate:any)=>candidate.version===compareVersionNumber)??otherVersions.find((candidate:any)=>candidate.version<version?.version)??otherVersions[0];
 const versionChanges=version&&comparedVersion?diffConfigurationVersions(comparedVersion,version):[];
 if(!version)return <div className="configuration-details-page"><header className="configuration-subpage-header"><button type="button" className="registration-back-link" onClick={onClose}><ChevronLeft size={16}/>К конфигурациям автомобиля</button><h1>Конфигурация</h1></header><Empty text="Версия не найдена"/></div>;
 const names=(xs:any[])=>xs?.length?xs.map(x=>x.brand+' '+x.model+(x.quantity>1?' ×'+x.quantity:'')).join(', '):'—';
 const count=(xs:any[])=>xs?.reduce((n,x)=>n+(Number(x.quantity)||1),0)||0;
 const isCurrent=version.version===configuration.currentVersion;
 return <div className="configuration-details-page"><header className="configuration-subpage-header"><button type="button" className="registration-back-link" onClick={onClose}><ChevronLeft size={16}/>К конфигурациям автомобиля</button><span className="eyebrow">ГАРАЖ USD / ИСТОРИЯ СБОРКИ</span><h1>{configuration.name} · v{version.version}</h1><p>Состав оборудования и история версий этой конфигурации.</p></header><div className="config-details">
  <div className="config-details-hero"><div className="config-details-badge">v{version.version}</div><div><span className="eyebrow">{isCurrent?'ТЕКУЩАЯ ВЕРСИЯ':'ИСТОРИЯ КОНФИГУРАЦИИ'}</span><h2>{configuration.name}</h2><p>{version.additionalDescription||'Без описания'}</p></div></div>
  {!admin&&<section className="member-config-timeline" aria-label="История конфигураций"><div className="member-config-timeline-heading"><span className="eyebrow">ИСТОРИЯ ОБОРУДОВАНИЯ</span><h2>История оборудования</h2><p>Каждая версия хранит состав оборудования на момент сохранения. Выберите запись, чтобы посмотреть её.</p></div>
    <div className="member-config-timeline-list">{(configuration.versions??[]).slice().sort((a:any,b:any)=>b.version-a.version).map((v:any,index:number)=><button key={v.version} type="button" className={v.version===version.version?'selected':''} aria-current={v.version===version.version?'true':undefined} onClick={()=>setVersionNumber(v.version)}><span className="member-config-timeline-number">{String(index+1).padStart(2,'0')}</span><span className="member-config-timeline-content"><strong>{v.version===configuration.currentVersion?'Текущая конфигурация':'Версия оборудования v'+v.version}</strong><small>{v.createdAt?new Date(v.createdAt).toLocaleDateString('ru-RU'):'Сохранённая версия конфигурации'}</small></span><span className={v.version===configuration.currentVersion?'timeline-live':'timeline-archive'}>{v.version===configuration.currentVersion?'АКТУАЛЬНА':'АРХИВ'}</span><ChevronRight size={18}/></button>)}</div>
   </section>}
   {admin&&configuration.versions?.length>1&&<div className="config-version-history"><span className="eyebrow">ВЕРСИИ</span><div className="page-actions">{configuration.versions.map((v:any)=><button key={v.version} className={'secondary-button compact '+(v.version===version.version?'active':'')} onClick={()=>setVersionNumber(v.version)}>v{v.version}{v.version===configuration.currentVersion?' · текущая':''}</button>)}</div></div>}
  {comparedVersion&&<section className="configuration-compare" aria-label="Сравнение версий оборудования"><div className="configuration-compare-head"><div><span className="eyebrow">ИЗМЕНЕНИЯ ОБОРУДОВАНИЯ</span><h3>Что изменилось в сборке?</h3><p>Сравнение сохранённых версий без изменения исторических данных.</p></div><label>Сравнить v{version.version} с <select aria-label="Версия для сравнения" value={comparedVersion.version} onChange={event=>setCompareVersionNumber(Number(event.target.value))}>{otherVersions.map((candidate:any)=><option key={candidate.version} value={candidate.version}>Версия {candidate.version}{candidate.version===configuration.currentVersion?' · текущая':''}</option>)}</select></label></div>{versionChanges.length?<div className="configuration-compare-sections">{versionChanges.map(section=><div className="configuration-compare-section" key={section.key}><h4>{section.title}</h4><ul>{section.changes.map((change,index)=><li key={section.key+'-'+index}><strong>{change.label}</strong><span className="configuration-compare-values"><del aria-label="Было">{change.before}</del><ChevronRight size={15} aria-hidden="true"/><ins aria-label="Стало">{change.after}</ins></span></li>)}</ul></div>)}</div>:<p className="configuration-compare-empty" role="status">В этих версиях состав оборудования и указанные параметры совпадают.</p>}</section>}
 {version.historicalConfirmations?.length>0&&<p className="notice">Финал 2026 · подтверждено участником {new Date(version.historicalConfirmations[0].confirmedAt).toLocaleDateString('ru-RU')}</p>}
  <div className="config-stat-grid"><div><span>Головные устройства</span><strong>{version.headUnits?.length||0}</strong></div><div><span>Аудиокомпоненты</span><strong>{count(version.audioComponents)}</strong></div><div><span>Усилители</span><strong>{count(version.amplifiers)}</strong></div><div><span>Питание</span><strong>{count(version.batteries)+count(version.generators)}</strong></div></div>
  <div className="config-detail-grid">
   <div className="detail-block"><span>Виброизоляция</span><strong>{version.vibrationIsolation||'—'}</strong></div>
   <div className="detail-block"><span>Описание</span><strong>{version.additionalDescription||'—'}</strong></div>
   <div className="detail-block"><span>Головные устройства</span><strong>{names(version.headUnits)}</strong></div>
   <div className="detail-block"><span>Аудиокомпоненты</span><strong>{names(version.audioComponents)}</strong></div>
   <div className="detail-block"><span>Усилители</span><strong>{names(version.amplifiers)}</strong></div>
   <div className="detail-block"><span>Аккумуляторы</span><strong>{version.batteries?.length?version.batteries.map((x:any)=>`${x.brand} · ${x.model} А · ${x.quantity} сек.`).join(', '):'—'}</strong></div>
   <div className="detail-block"><span>Генераторы</span><strong>{version.generators?.length?version.generators.map((x:any)=>`${x.quantity} × ${x.model} А`).join(', '):'—'}</strong></div>
  </div>
 </div>{onEdit&&isCurrent&&<div className="configuration-page-actions"><button className="primary-button" onClick={onEdit}><Pencil size={15}/>Редактировать текущую версию</button></div>}</div>
}

export default ConfigurationsPage;
