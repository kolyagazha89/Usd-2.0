import './car-editor-journey.css';
import {useEffect,useState,type FormEvent} from 'react';
import {AlertTriangle,ChevronLeft,ChevronRight,Loader2,Plus,RefreshCw,Search} from 'lucide-react';
import {apiDelete,apiGet,apiPatch,apiPost,listData,type User} from '../api';
import {formatPlateInput,isValidPlate} from '../profile-validation';

function CarsPage({user,go,PageFrame,Empty,LoadingPage,EntityDetailModal,displayCarName}: {user:User;go:(path:string)=>void;PageFrame:React.ComponentType<any>;Empty:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;EntityDetailModal:React.ComponentType<any>;displayCarName:(car:any,fallback?:string)=>string}){
 const canEdit=user.role==='ADMIN';const pageSize=25;
 const [page,setPage]=useState(1);
 const [cars,setCars]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[detail,setDetail]=useState<any|null>(null),[deactivateTarget,setDeactivateTarget]=useState('');
 const load=async()=>{setLoading(true);setError('');try{setCars(listData(await apiGet<any>('/cars')))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки автомобилей')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const removeCar=async(id:string)=>{setError('');try{await apiDelete('/cars/'+id);setDeactivateTarget('');await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка деактивации')}};
 const filtered=cars.filter(c=>{const q=search.trim().toLowerCase();if(!q)return true;return [c.brand,c.model,c.registrationNumber,c.registrationCountry,c.color,c.participant?.lastName,c.participant?.firstName,c.participant?.team].filter(Boolean).join(' ').toLowerCase().includes(q)});
 const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize)),currentPage=Math.min(page,pageCount),start=(currentPage-1)*pageSize,visibleCars=filtered.slice(start,start+pageSize);
 useEffect(()=>setPage(value=>Math.min(value,pageCount)),[pageCount]);
 return <PageFrame title="Автомобили" subtitle="Автомобили участников и их конфигурации" action={canEdit&&!detail?<button className="primary-button compact" onClick={()=>go('/admin/cars/new')}><Plus size={15}/>Добавить автомобиль</button>:undefined}>
  {detail ? <EntityDetailModal title="Автомобиль" item={detail} columns={[{key:'brand',label:'Марка'},{key:'model',label:'Модель'},{key:'registrationNumber',label:'Госномер'},{key:'registrationCountry',label:'Страна регистрации'},{key:'color',label:'Цвет'},{key:'isActive',label:'Статус'}]} inline onClose={()=>setDetail(null)} onEdit={canEdit?()=>go('/admin/cars/edit?carId='+encodeURIComponent(detail.id)):undefined} onDelete={canEdit&&detail.isActive?()=>{setDetail(null);setDeactivateTarget(detail.id)}:undefined} extra={<button className="secondary-button" onClick={()=>{setDetail(null);go('/admin/cars/configurations?carId='+encodeURIComponent(detail.id))}}>Открыть конфигурации</button>}/> : <>
  <div className="toolbar"><div className="search-box"><Search size={15}/><input value={search} aria-label="Поиск автомобилей" onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Марка, модель, госномер, участник"/></div><button className="secondary-button compact" aria-label="Обновить список автомобилей" onClick={()=>void load()}><RefreshCw size={14}/></button><span className="row-count">{filtered.length} автомобилей</span></div>
  {error&&<div className="notice"><AlertTriangle size={18}/><span>{error}</span></div>}
  <div className="panel table-wrap">{loading?<LoadingPage small/>:<>{filtered.length?<><table className="data-table"><thead><tr><th>Автомобиль</th><th>Участник</th><th>Госномер</th><th>Цвет</th><th>Конфигурации</th><th>Статус</th><th/></tr></thead><tbody>{visibleCars.map(car=><tr key={car.id} className="clickable-row" onClick={()=>setDetail(car)}><td data-label="Автомобиль"><button type="button" className="car-name-button" onClick={event=>{event.stopPropagation();setDetail(car)}}>{displayCarName(car)}</button></td><td data-label="Участник">{car.participant?[car.participant.lastName,car.participant.firstName].filter(Boolean).join(' '):'—'}</td><td data-label="Госномер">{car.registrationCountry} · {car.registrationNumber}</td><td data-label="Цвет">{car.color||'—'}</td><td data-label="Конфигурации"><button className="text-button" onClick={e=>{e.stopPropagation();go('/admin/cars/configurations?carId='+encodeURIComponent(car.id))}}>{car.configurations?.length??0} конф.</button></td><td data-label="Статус"><span className={"badge "+(car.isActive?'good':'')}>{car.isActive?'Активен':'Неактивен'}</span></td><td data-label="Действия" className="row-actions" onClick={e=>e.stopPropagation()}>{canEdit&&<><button className="icon-button" title="Изменить" onClick={()=>go('/admin/cars/edit?carId='+encodeURIComponent(car.id))}>✎</button>{car.isActive&&(deactivateTarget===car.id?<span className="inline-confirm-actions"><span>Деактивировать?</span><button className="danger-button compact" onClick={()=>void removeCar(car.id)}>Подтвердить</button><button className="secondary-button compact" onClick={()=>setDeactivateTarget('')}>Отмена</button></span>:<button className="icon-button danger" title="Деактивировать" onClick={()=>setDeactivateTarget(car.id)}>×</button>)}</>}</td></tr>)}</tbody></table>{filtered.length>pageSize&&<div className="list-pagination"><span role="status" aria-live="polite">Показаны {start+1}–{Math.min(start+pageSize,filtered.length)} из {filtered.length}</span><nav aria-label="Страницы автомобилей"><button type="button" className="secondary-button compact" aria-label="Предыдущая страница автомобилей" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={16}/></button><span>{currentPage} / {pageCount}</span><button type="button" className="secondary-button compact" aria-label="Следующая страница автомобилей" disabled={currentPage===pageCount} onClick={()=>setPage(currentPage+1)}><ChevronRight size={16}/></button></nav></div>}</>:<Empty text={search.trim()?'По запросу ничего не найдено':'Автомобилей пока нет'}/>}</>}</div>

  

  </>}
 </PageFrame>
}
export function CarEditorPage({user,carId,go,PageFrame,LoadingPage,ErrorPanel,isValidPlate,clean}:{user:User;carId:string;go:(path:string)=>void;PageFrame:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;isValidPlate:(country:string,plate:string)=>boolean;clean:(value:any)=>any}){
 const [value,setValue]=useState<any>(carId?null:{}),[participants,setParticipants]=useState<any[]>([]),[loading,setLoading]=useState(Boolean(carId)),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const countries=['RU','NO','FI','EE','LV','LT','PL','BY','UA','GE','AZ','KZ','CN','MN','KP','US'];
 useEffect(()=>{let active=true;const load=async()=>{setLoading(true);setError('');try{const [participantResponse,carsResponse]=await Promise.all([apiGet<any>('/admin/participants'),carId?apiGet<any>('/cars'):Promise.resolve(null)]);if(!active)return;setParticipants(listData(participantResponse));if(carId){const car=listData(carsResponse).find((item:any)=>item.id===carId);if(!car){setError('Автомобиль не найден или недоступен');setValue(null)}else setValue(car)}else setValue({})}catch(e){if(active){setError(e instanceof Error?e.message:'Не удалось загрузить данные автомобиля');setValue(null)}}finally{if(active)setLoading(false)}};if(user.role!=='ADMIN'){setError('Редактировать автомобили может только ADMIN');setValue(null);setLoading(false)}else void load();return()=>{active=false}},[carId,user.role]);
 const save=async(v:any)=>{setSaving(true);setError('');try{const {participantId,...car}=v;if(carId)await apiPatch('/cars/'+carId,car);else await apiPost('/participants/'+encodeURIComponent(participantId)+'/cars',car);go('/admin/cars')}catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения автомобиля')}finally{setSaving(false)}};
 if(user.role!=='ADMIN')return <PageFrame title={carId?'Редактировать автомобиль':'Новый автомобиль'} subtitle="Карточка автомобиля участника"><ErrorPanel message="Редактировать автомобили может только ADMIN"/></PageFrame>;
 if(loading)return <PageFrame title={carId?'Редактировать автомобиль':'Новый автомобиль'} subtitle="Карточка автомобиля участника"><LoadingPage/></PageFrame>;
 if(error&&!value)return <PageFrame title={carId?'Редактировать автомобиль':'Новый автомобиль'} subtitle="Карточка автомобиля участника"><ErrorPanel message={error} retry={()=>window.location.reload()}/></PageFrame>;
 return <PageFrame title={carId?'Редактировать автомобиль':'Новый автомобиль'} subtitle="Карточка автомобиля участника"><CarEditorForm value={value??{}} participants={participants} countries={countries} saving={saving} error={error} onClose={()=>go('/admin/cars')} onSubmit={save} isValidPlate={isValidPlate} clean={clean}/></PageFrame>;
}

function CarEditorForm({value,participants,countries,saving,error,onClose,onSubmit,isValidPlate,clean}:{value:any;participants:any[];countries:string[];saving:boolean;error?:string;onClose:()=>void;onSubmit:(v:any)=>Promise<void>;isValidPlate:(country:string,plate:string)=>boolean;clean:(value:any)=>any}){
 const [v,setV]=useState<any>({participantId:value.participantId??'',brand:value.brand??'',model:value.model??'',registrationCountry:value.registrationCountry??'RU',registrationNumber:value.registrationNumber??'',color:value.color??'',isPublic:value.isPublic??true});
 const [validationError,setValidationError]=useState('');
 const name=(p:any)=>[p.lastName,p.firstName,p.middleName].filter(Boolean).join(' ');
 const [step,setStep]=useState<0|1|2>(0);
 const identityReady=Boolean((value.id||v.participantId)&&String(v.brand??'').trim()&&String(v.model??'').trim());
 const plateReady=Boolean(String(v.registrationNumber??'').trim()&&isValidPlate(String(v.registrationCountry??'RU'),String(v.registrationNumber)));
 const completeSteps=[identityReady,plateReady,false];
 const stages=[{name:'Автомобиль и владелец',hint:'Участник, марка и модель'},{name:'Регистрация',hint:'Страна, номер и цвет'},{name:'Публикация',hint:'Проверка и сохранение'}];
 const validate=()=>{
  if(!identityReady)return 'Сначала выберите участника и укажите марку и модель.';
  if(!plateReady)return 'Укажите корректный госномер для выбранной страны.';
  return '';
 };
 const advance=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();setValidationError('');
  if(step===0&&!identityReady){setValidationError('Выберите участника, марку и модель автомобиля.');return}
  if(step===1&&!plateReady){setValidationError('Госномер не соответствует формату выбранной страны.');return}
  if(step<2){setStep((step+1) as 0|1|2);return}
  const invalid=validate();if(invalid){setValidationError(invalid);setStep(!identityReady?0:1);return}
  void onSubmit(clean(v));
 };
 return <section className="panel resource-editor-page usd-car-editor-journey">
  <div className="resource-editor-heading"><div><span className="eyebrow">АВТОПАРК · КАРТОЧКА АВТОМОБИЛЯ</span><h2>{value.id?'Редактировать автомобиль':'Новый автомобиль'}</h2><p>Три коротких шага вместо одной длинной формы. До сохранения данные остаются черновиком.</p></div><button type="button" className="secondary-button" onClick={onClose}><ChevronLeft size={16}/>К списку</button></div>
  <nav className="usd-car-editor-steps" aria-label="Этапы заполнения автомобиля">{stages.map((item,index)=><button key={item.name} type="button" aria-current={step===index?'step':undefined} className={'usd-car-editor-step'+(step===index?' is-active':'')+(completeSteps[index]?' is-complete':'')} disabled={index===1&&!identityReady||index===2&&(!identityReady||!plateReady)} onClick={()=>{setStep(index as 0|1|2);setValidationError('')}}><span className="usd-car-editor-step-number">{index+1}</span><span><strong>{item.name}</strong><small>{index===2?'Проверьте данные':completeSteps[index]?'Заполнено':item.hint}</small></span></button>)}</nav>
  <div className="usd-car-editor-progress"><div role="progressbar" aria-label="Заполнение карточки автомобиля" aria-valuemin={0} aria-valuemax={2} aria-valuenow={Number(identityReady)+Number(plateReady)} style={{width:((Number(identityReady)+Number(plateReady))/2*100)+'%'}}/></div>
  {(error||validationError)&&<div className="form-error" role="alert"><AlertTriangle size={16}/><span>{validationError||error}</span></div>}
  <form className="form usd-car-editor-form" onSubmit={advance} noValidate>
   {step===0&&<div className="usd-car-editor-panel" aria-label="Основные данные автомобиля">
    <h3>Кому принадлежит автомобиль?</h3><p>Укажите владельца и модель. Эти данные будут использоваться в регистрациях и протоколах USD.</p>
    {!value.id&&<label>Участник<select aria-label="Участник" value={v.participantId} onChange={e=>setV({...v,participantId:e.target.value})} required><option value="">Выберите участника</option>{participants.map(p=><option key={p.id} value={p.id}>{name(p)}{p.team?' · '+p.team:''}</option>)}</select></label>}
    <div className="form-grid-2"><label>Марка<input aria-label="Марка" value={v.brand} onChange={e=>setV({...v,brand:e.target.value})} autoComplete="off" required/></label><label>Модель<input aria-label="Модель" value={v.model} onChange={e=>setV({...v,model:e.target.value})} autoComplete="off" required/></label></div>
   </div>}
   {step===1&&<div className="usd-car-editor-panel" aria-label="Регистрационные данные">
    <h3>Госномер и внешний вид</h3><p>Номер проверяется по правилам страны регистрации. Цвет указывать необязательно.</p>
    <div className="form-grid-2"><label>Страна регистрации<select aria-label="Страна регистрации" value={v.registrationCountry} onChange={e=>setV({...v,registrationCountry:e.target.value,registrationNumber:''})}>{countries.map(x=><option key={x}>{x}</option>)}</select></label><label>Госномер<input aria-label="Госномер" value={v.registrationNumber} onChange={e=>setV({...v,registrationNumber:formatPlateInput(String(v.registrationCountry??'RU'),e.target.value)})} maxLength={16} autoCapitalize="characters" required/></label></div>
    <label>Цвет автомобиля<input aria-label="Цвет автомобиля" value={v.color} onChange={e=>setV({...v,color:e.target.value})}/></label>
   </div>}
   {step===2&&<div className="usd-car-editor-panel" aria-label="Проверка и публикация">
    <h3>Проверьте карточку</h3><p>После сохранения автомобиль появится в гараже владельца. Изменить данные можно будет позже.</p>
    <dl className="usd-car-editor-summary"><div><dt>Автомобиль</dt><dd>{v.brand} {v.model}</dd></div><div><dt>Госномер</dt><dd>{v.registrationCountry} · {v.registrationNumber}</dd></div><div><dt>Цвет</dt><dd>{v.color||'Не указан'}</dd></div></dl>
    <label className="checkbox-row"><input type="checkbox" checked={!!v.isPublic} onChange={e=>setV({...v,isPublic:e.target.checked})}/>Показывать автомобиль в публичной части USD</label>
   </div>}
   <div className="usd-car-editor-actions">{step>0&&<button type="button" className="secondary-button" disabled={saving} onClick={()=>{setStep((step-1) as 0|1|2);setValidationError('')}}><ChevronLeft size={15}/>Назад</button>}<button type="submit" className="primary-button" disabled={saving}>{saving?<><Loader2 className="spin" size={15}/>Сохраняем…</>:step===2?'Сохранить автомобиль':<>Продолжить <ChevronRight size={15}/></>}</button></div>
  </form>
 </section>;
}

export default CarsPage;
