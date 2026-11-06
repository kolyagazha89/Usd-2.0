import {useId,useMemo,useState,type KeyboardEvent} from 'react';

/** Searchable, keyboard-accessible catalog field. Unlike datalist, its suggestions
 * are visible and selectable in mobile Safari as well as desktop browsers. */
export function VehicleCatalogPicker({
 label,value,options,onChange,disabled=false,placeholder,
}:{
 label:string;value:string;options:string[];onChange:(value:string)=>void;
 disabled?:boolean;placeholder?:string;
}){
 const uid=useId(),[open,setOpen]=useState(false),[active,setActive]=useState(0);
 const search=value.trim().toLocaleLowerCase('ru');
 const matches=useMemo(()=>{
  const pool=search?options.filter(item=>item.toLocaleLowerCase('ru').includes(search)):options;
  return [...pool].sort((a,b)=>{
   const aStarts=a.toLocaleLowerCase('ru').startsWith(search)?0:1;
   const bStarts=b.toLocaleLowerCase('ru').startsWith(search)?0:1;
   return aStarts-bStarts;
  }).slice(0,10);
 },[options,search]);
 // An already complete selection must not leave a popup covering the next
 // form action, particularly the "Continue" button on short iPhone screens.
 const exactMatch=options.some(item=>item.trim().toLocaleLowerCase('ru')===search);
 const showMenu=open&&!disabled&&matches.length>0&&!exactMatch;
 const choose=(item:string)=>{onChange(item);setOpen(false);setActive(0)};
 const onKeyDown=(event:KeyboardEvent<HTMLInputElement>)=>{
  if(event.key==='Escape'){setOpen(false);return}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();
   setOpen(true);
   setActive(index=>Math.max(0,Math.min(matches.length-1,index+(event.key==='ArrowDown'?1:-1))));
  }else if(event.key==='Enter'&&showMenu){
   event.preventDefault();choose(matches[Math.min(active,matches.length-1)]);
  }
 };
 return <div className="vehicle-catalog-field">
  <label htmlFor={uid}>{label}</label>
  <input id={uid} type="text" value={value} disabled={disabled}
   autoComplete="off" autoCorrect="off" spellCheck={false}
   placeholder={placeholder} role="combobox" aria-autocomplete="list"
   aria-haspopup="listbox" aria-controls={uid+'-list'}
   aria-expanded={showMenu}
   aria-activedescendant={showMenu?uid+'-option-'+Math.min(active,matches.length-1):undefined}
   onFocus={()=>{setActive(0);setOpen(true)}}
   onChange={event=>{onChange(event.target.value);setActive(0);setOpen(true)}}
   onKeyDown={onKeyDown}
   onBlur={()=>setOpen(false)} required/>
  {showMenu&&<ul id={uid+'-list'} className="vehicle-catalog-suggestions" role="listbox" aria-label={label}>
   {matches.map((item,index)=><li key={item} id={uid+'-option-'+index}
     role="option" aria-selected={index===active}>
    <button type="button" tabIndex={-1}
     onPointerDown={event=>event.preventDefault()}
     onMouseDown={event=>event.preventDefault()}
     onClick={()=>choose(item)}>{item}</button>
   </li>)}
  </ul>}
 </div>;
}
