import {useEffect,useId,useRef,useState} from 'react';
import {AlertTriangle,Check,ChevronDown,ChevronLeft,ChevronRight,Info,Loader2,Pencil,Trash2} from 'lucide-react';
import {formatPlateInput,formatPhoneInput,isValidInternationalPhone,isValidPlate} from '../profile-validation';

type Field={name:string;label:string;type?:string;required?:boolean;options?:string[];optionsPath?:string;optionLabel?:(item:any)=>string;placeholder?:string;help?:string};

function fieldPlaceholder(f:Field){if(f.placeholder)return f.placeholder;const p:Record<string,string>={name:'Например: USD Тюмень 2026',lastName:'Фамилия',firstName:'Имя',middleName:'Отчество (необязательно)',city:'Например: Тюмень',team:'Название команды',phone:'+7 900 000-00-00',venue:'Название площадки',address:'Адрес проведения',description:'Короткое описание…',registrationNumber:'Госномер',brand:'Например: Lada',model:'Например: Priora',color:'Например: чёрный'};return p[f.name]??'';}
export function SearchableSelect({value,options,onChange,placeholder='Выберите…',required=false}:{value:any;options:any[];onChange:(value:string)=>void;placeholder?:string;required?:boolean}){
 const[query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(0);
 const id=useId(),input=useRef<HTMLInputElement>(null),menu=useRef<HTMLDivElement>(null);
 const optionId=(option:any)=>String(option.id??option.value);
 const optionLabel=(option:any)=>String(option.label??option.name??option.value??option.id);
 const selected=options.find(option=>optionId(option)===String(value));
 const selectedLabel=selected?optionLabel(selected):'';
 const filtered=options.filter(option=>optionLabel(option).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0,80);
 const close=()=>{setOpen(false);setQuery('');setActive(0)};
 const choose=(option:any)=>{onChange(optionId(option));close()};
 useEffect(()=>{input.current?.setCustomValidity(required&&!selected?'Выберите значение из списка.':'')},[required,selected]);
 useEffect(()=>{if(open)menu.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({block:'nearest'})},[active,open,query]);
 return <div className="searchable-select">
  <input ref={input} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id} aria-activedescendant={open&&filtered[active]?id+'-'+active:undefined} aria-required={required||undefined} autoComplete="off"
   value={open?query:selectedLabel} placeholder={placeholder} required={required&&!selected}
   onFocus={()=>{setOpen(true);setActive(0)}}
   onChange={event=>{setQuery(event.target.value);setActive(0);setOpen(true);if(!event.target.value&&value)onChange('')}}
   onBlur={close}
   onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();close();return}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
     event.preventDefault();setOpen(true);
     setActive(index=>!open?0:Math.max(0,Math.min(filtered.length-1,index+(event.key==='ArrowDown'?1:-1))));return;
    }
    if(open&&(event.key==='Home'||event.key==='End')){event.preventDefault();setActive(event.key==='Home'?0:Math.max(0,filtered.length-1));return}
    if(open&&event.key==='Enter'){event.preventDefault();if(filtered[active])choose(filtered[active])}
   }}/>
  <ChevronDown className="searchable-select-chevron" aria-hidden="true"/>
  {open&&<div ref={menu} id={id} role="listbox" className="searchable-select-menu">{filtered.length?filtered.map((option,index)=><button type="button" role="option" id={id+'-'+index} key={optionId(option)} tabIndex={-1} aria-selected={optionId(option)===String(value)} data-active={index===active} className={index===active?'is-active':''} onMouseEnter={()=>setActive(index)} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(option)}>{optionLabel(option)}</button>):<span className="searchable-select-empty" role="status">Ничего не найдено</span>}</div>}
 </div>
}

export function EntityForm({fields,initial,saving,relationOptions={},onSubmit,enumLabel}:{fields:Field[];initial:any;saving:boolean;relationOptions?:Record<string,any[]>;onSubmit:(v:any)=>Promise<void>;enumLabel:(v:any)=>string}){const[v,setV]=useState<any>(initial??{}),[validationError,setValidationError]=useState('');const renderControl=(f:Field)=>{const opts=relationOptions[f.name]??[];const inputValue=f.type==='date'&&typeof v[f.name]==='string'?v[f.name].slice(0,10):f.type==='datetime-local'&&typeof v[f.name]==='string'?v[f.name].slice(0,16):v[f.name]??'';if(f.type==='checkbox')return <div className="field-check"><input type="checkbox" checked={v[f.name]===true} onChange={e=>setV({...v,[f.name]:e.target.checked})}/><span><b>{f.label}</b>{f.help&&<small>{f.help}</small>}</span></div>;if(f.optionsPath){const options=f.name==='team'?opts.map(o=>({value:String(o.name),label:String(o.name)})):opts.map(o=>({id:o.id,label:f.optionLabel?f.optionLabel(o):o.name??o.id}));return <SearchableSelect value={v[f.name]??''} options={options} onChange={value=>setV({...v,[f.name]:value})} required={f.required}/>};if(f.options)return <SearchableSelect value={v[f.name]??''} options={f.options.map(o=>({value:o,label:enumLabel(o)}))} onChange={value=>setV({...v,[f.name]:value})} required={f.required}/>;if(f.type==='textarea')return <textarea rows={4} required={f.required} value={v[f.name]??''} placeholder={fieldPlaceholder(f)} onChange={e=>setV({...v,[f.name]:e.target.value})}/>;return <input type={f.type??(f.name==='phone'?'tel':'text')} inputMode={f.name==='phone'?'tel':f.name==='registrationNumber'?'text':undefined} autoCapitalize={f.name==='registrationNumber'?'characters':undefined} maxLength={f.name==='registrationNumber'?9:f.name==='phone'?25:undefined} value={inputValue} placeholder={fieldPlaceholder(f)} onChange={e=>setV({...v,[f.name]:f.type==='number'?(e.target.value===''?undefined:Number(e.target.value)):f.name==='registrationNumber'?formatPlateInput(String(v.registrationCountry??'RU'),e.target.value):f.name==='phone'?formatPhoneInput(e.target.value):e.target.value})} required={f.required}/>;};return <form className="form modal-form" onSubmit={e=>{e.preventDefault();setValidationError("");if(fields.some(f=>f.name==="phone")&&v.phone&&!isValidInternationalPhone(String(v.phone))){setValidationError("Введите международный номер телефона с корректным кодом страны, например +7 999 123-45-67.");return}const country=String(v.registrationCountry??"RU");if(fields.some(f=>f.name==="registrationNumber")&&v.registrationNumber&&!isValidPlate(country,String(v.registrationNumber))){setValidationError("Госномер не соответствует формату выбранной страны.");return}void onSubmit(clean(v))}}><div className="form-intro"><Info size={17}/><span>Поля со звёздочкой <b>*</b> обязательны.</span></div><div className="entity-fields">{fields.map(f=><label key={f.name} className={f.type==='checkbox'?'checkbox-row field-wrapper':''}><span className="field-label">{f.type==='checkbox'?null:<>{f.label}{f.required&&<em>*</em>}</>}</span>{renderControl(f)}{f.type!=='checkbox'&&f.help&&<small className="field-help">{f.help}</small>}</label>)}</div>{validationError&&<div className="form-error" role="alert">{validationError}</div>}<button className="primary-button save-button" disabled={saving}>{saving?<><Loader2 className="spin" size={16}/>Сохраняем…</>:<><Check size={16}/>Сохранить изменения</>}</button></form>}

function clean(v:any){return Object.fromEntries(Object.entries(v).filter(([,x])=>x!==''&&x!==undefined))}
function getPath(o:any,path:string){return path.split('.').reduce((a,k)=>a?.[k],o)}
export function EntityDetailWorkspace({title,item,fields,columns,onClose,onEdit,onDelete,onOpen,extra,enumLabel,formatDate}:{title:string;item:any;fields?:Field[];columns?:{key:string;label:string}[];onClose:()=>void;onEdit?:()=>void;onDelete?:()=>Promise<void>|void;onOpen?:()=>void;extra?:React.ReactNode;inline?:boolean;enumLabel:(v:any)=>string;formatDate:(v:string)=>string}){
 const defs=(fields?.length?fields.map(f=>({key:f.name,label:f.label})):columns??[]).filter((x,i,a)=>a.findIndex(y=>y.key===x.key)===i);
 const values=defs.map(d=>({label:d.label,value:getPath(item,d.key)})).filter(x=>x.value!==undefined&&x.value!==null&&x.value!=='');
 return <section className="panel resource-editor-page"><div className="resource-editor-heading"><div><span className="eyebrow">USD · ПОДРОБНАЯ ИНФОРМАЦИЯ</span><h2>{item.name||item.lastName||item.email||title}</h2><p>{title}</p></div><div className="page-actions">{item.status&&<span className="badge">{enumLabel(item.status)}</span>}<button type="button" className="secondary-button" onClick={onClose}><ChevronLeft size={16}/>Назад</button></div></div><div className="detail-grid">{values.length?values.map((x,i)=><div key={x.label+i}><span>{x.label}</span><strong>{formatDetailValue(x.value,x.label,formatDate,enumLabel)}</strong></div>):<div><span>Информация</span><strong>Нет данных для отображения</strong></div>}</div><div className="detail-actions">{extra}{onOpen&&<button className="secondary-button" onClick={onOpen}><ChevronRight size={16}/>Открыть раздел</button>}{onEdit&&<button className="primary-button" onClick={onEdit}><Pencil size={16}/>Редактировать</button>}{onDelete&&<button className="danger-button" onClick={()=>void onDelete()}><Trash2 size={16}/>Удалить</button>}</div></section>
}
function formatDetailValue(v:any,label='',formatDate:(v:string)=>string,enumLabel:(v:any)=>string){if(typeof v==='boolean')return v?'Да':'Нет';if(typeof v==='number')return String(v);if(typeof v==='string'&&v.includes('T')&&!Number.isNaN(Date.parse(v)))return formatDate(v);if(typeof v==='object')return Array.isArray(v)?(v.length?JSON.stringify(v):'Нет данных'):JSON.stringify(v);if(label.toLowerCase().includes('статус')||label.toLowerCase().includes('роль'))return enumLabel(v);return String(v)}
export {clean};
