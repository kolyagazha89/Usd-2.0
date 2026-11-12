import {useEditorScroll} from './view-state';
import {useEffect,useState} from 'react';
import {AlertTriangle,Bell,Plus,Pencil,Trash2} from 'lucide-react';
import {getSiteSettings,updateSiteSettings,uploadSiteAsset} from '../api';
import {validateImageUpload} from './upload-validation';
import {newNewsDraft,prepareNewsItem,switchNewsPublication} from './news-content-lifecycle';

function NewsPage({PageFrame,PanelTitle,LoadingPage,Empty,formatDate}: {
 PageFrame:React.ComponentType<any>;PanelTitle:React.ComponentType<any>;
 LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>;
 formatDate:(value:string)=>string;
}){
 const [settings,setSettings]=useState<any|null>(null),[items,setItems]=useState<any[]>([]);
 const [editing,setEditing]=useState<any|null>(null),[preview,setPreview]=useState(false);
 const [previewPhoto,setPreviewPhoto]=useState('');
 const [confirmDeleteId,setConfirmDeleteId]=useState('');
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 useEditorScroll('news',editing!==null,!loading);
 const load=async()=>{
  setLoading(true);setError('');
  try{
   const r=await getSiteSettings();
   setSettings(r.settings);
   setItems(Array.isArray(r.settings?.news)?r.settings.news:[]);
  }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить новости')}
  finally{setLoading(false)}
 };
 useEffect(()=>{void load()},[]);
 useEffect(()=>{
  const file=editing?.file;
  if(!(file instanceof File)){setPreviewPhoto('');return}
  const url=URL.createObjectURL(file);
  setPreviewPhoto(url);
  return()=>URL.revokeObjectURL(url);
 },[editing?.file]);
 const persist=async(next:any[])=>{
  if(!settings)throw new Error('Сначала загрузите новости.');
  // An unchanged revision is required even for toggles and deletion. On
  // conflict the editor remains open: no lost ADMIN draft or bulk overwrite.
  const response=await updateSiteSettings({_newsRevision:settings._newsRevision,news:next});
  setSettings(response.settings);
  setItems(Array.isArray(response.settings?.news)?response.settings.news:next);
 };
 const showError=(e:unknown)=>setError(e instanceof Error?e.message:'Не удалось сохранить изменения. Обновите страницу.');
 const save=async()=>{
  if(!settings||!editing||saving)return;
  setSaving(true);setError('');
  try{
   const id=editing.id??crypto.randomUUID();
   let item=prepareNewsItem(editing,id,new Date().toISOString());
   if(editing.file instanceof File){
    const uploadError=validateImageUpload(editing.file);
    if(uploadError)throw new Error(uploadError);
    const uploaded=await uploadSiteAsset('news-'+id,editing.file);
    item={...item,photoUrl:uploaded.publicPath};
   }
   const next=editing.id?items.map((x:any)=>x.id===id?item:x):[item,...items];
   await persist(next);
   setEditing(null);setPreview(false);
  }catch(e){showError(e)}finally{setSaving(false)}
 };
 const toggle=async(item:any)=>{
  if(!settings||saving)return;
  setSaving(true);setError('');
  try{
   const updated=switchNewsPublication(item,new Date().toISOString());
   await persist(items.map((x:any)=>x.id===item.id?updated:x));
  }catch(e){showError(e)}finally{setSaving(false)}
 };
 const remove=async(item:any)=>{
  if(!settings||saving)return;
  setSaving(true);setError('');
  try{
   await persist(items.filter((x:any)=>x.id!==item.id));
   setConfirmDeleteId('');
  }catch(e){showError(e)}finally{setSaving(false)}
 };
 const openEditor=(item:any)=>{setError('');setPreview(false);setEditing({...item})};
 const previewImage=previewPhoto||editing?.photoUrl;
 return <PageFrame title="Новости" subtitle="Черновики, предпросмотр и публикация новостей USD"
  action={<button type="button" className="primary-button compact" disabled={saving}
   onClick={()=>openEditor(newNewsDraft())}><Plus size={15}/>Создать новость</button>}>
  {error&&<div className="form-error" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
  {editing&&<div className="panel news-editor">
   <PanelTitle title={editing.id?'Редактировать новость':'Новая новость · черновик'} icon={Bell}/>
   <p className="settings-help">Новая новость не появляется на сайте до явной публикации. Сначала проверьте текст и изображение.</p>
   <div className="settings-form-grid">
    <label>Заголовок<input value={editing.title??''} maxLength={160} required
     onChange={e=>setEditing({...editing,title:e.target.value})}/></label>
    <label>Ссылка на материал (HTTPS)<input type="url" value={editing.url??''} placeholder="https://…"
     onChange={e=>setEditing({...editing,url:e.target.value})}/></label>
    <label className="settings-field-wide">Краткое описание<textarea rows={3} maxLength={500}
     value={editing.excerpt??''} onChange={e=>setEditing({...editing,excerpt:e.target.value})}/></label>
    <label className="settings-field-wide">Полный текст<textarea rows={6}
     value={editing.body??''} onChange={e=>setEditing({...editing,body:e.target.value})}/></label>
    <label>Обложка новости<input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving}
     onChange={e=>setEditing({...editing,file:e.target.files?.[0]??null})}/></label>
    <label className="checkbox-row"><input type="checkbox" checked={editing.isPublished!==false}
     onChange={e=>setEditing({...editing,isPublished:e.target.checked})}/>Опубликована на сайте</label>
   </div>
   <div className="page-actions">
    <button type="button" className="secondary-button compact" aria-pressed={preview}
     onClick={()=>setPreview(x=>!x)}>{preview?'Закрыть предпросмотр':'Предпросмотр'}</button>
   </div>
   {preview&&<section className="panel" aria-label="Предпросмотр новости">
    <span className="eyebrow">{editing.isPublished!==false?'ПРОВЕРКА ПУБЛИКАЦИИ':'ЧЕРНОВИК · НЕ ВИДЕН ГОСТЯМ'}</span>
    {previewImage&&<img src={previewImage} alt="Предпросмотр обложки" style={{width:'100%',maxHeight:320,objectFit:'contain',borderRadius:12}}/>}
    <h3>{String(editing.title??'').trim()||'Заголовок новости'}</h3>
    {editing.excerpt&&<p>{editing.excerpt}</p>}
    {editing.body&&<p style={{whiteSpace:'pre-wrap'}}>{editing.body}</p>}
   </section>}
   <div className="page-actions">
    <button type="button" className="primary-button compact" disabled={saving}
     onClick={()=>void save()}>{saving?'Сохраняем…':editing.isPublished!==false?'Сохранить и опубликовать':'Сохранить черновик'}</button>
    <button type="button" className="secondary-button compact" disabled={saving}
     onClick={()=>{setEditing(null);setPreview(false)}}>Отмена</button>
   </div>
  </div>}
  <div className="panel table-wrap">{loading?<LoadingPage small/>:items.length?<table className="data-table">
   <thead><tr><th>Заголовок</th><th>Дата</th><th>Статус</th><th>Действия</th></tr></thead>
   <tbody>{items.map((n:any)=><tr key={n.id}>
    <td data-label="Заголовок"><strong>{n.title}</strong><small className="table-sub">{n.excerpt}</small></td>
    <td data-label="Дата">{n.publishedAt?formatDate(n.publishedAt):'Не опубликована'}</td>
    <td data-label="Статус"><span className={'badge '+(n.isPublished!==false?'good':'')}>{n.isPublished===false?'Черновик':'Опубликована'}</span></td>
    <td className="row-actions">
     <button type="button" className="secondary-button compact" disabled={saving}
      onClick={()=>openEditor(n)}><Pencil size={14}/>Изменить</button>
     <button type="button" className="secondary-button compact" disabled={saving}
      onClick={()=>void toggle(n)}>{n.isPublished===false?'Опубликовать':'Скрыть'}</button>
     {confirmDeleteId===n.id?<span className="inline-confirm-actions"><span>Удалить новость?</span>
      <button type="button" className="danger-button compact" disabled={saving}
       onClick={()=>void remove(n)}>Подтвердить</button>
      <button type="button" className="secondary-button compact" disabled={saving}
       onClick={()=>setConfirmDeleteId('')}>Отмена</button></span>
      :<button type="button" className="icon-button" disabled={saving}
       onClick={()=>setConfirmDeleteId(n.id)} title="Удалить"><Trash2 size={14}/></button>}
    </td>
   </tr>)}</tbody>
  </table>:<Empty text="Новостей пока нет. Создайте первую публикацию."/>}</div>
 </PageFrame>
}

export default NewsPage;
