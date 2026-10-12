import { useEffect, useState } from 'react';
import { CheckCircle2, FileClock, FileText, Loader2, UploadCloud } from 'lucide-react';
import { apiPost, getSiteSettings, updateSiteSettings, uploadRulesDocx } from './api';

type Block = { type: 'heading' | 'paragraph' | 'list-item' | 'table'; level?: number; text?: string; ordered?: boolean; rows?: string[][]; };
type Revision = { id: string; targetId: string; fileName: string; url: string; createdAt: string; blocks: Block[]; publishedAt?: string; };
type DocumentState = { published?: Revision | null; publishedVersions?: Revision[]; drafts?: Revision[]; };
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const newId = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16); });

function Preview({ blocks }: { blocks: Block[] }) {
  return <div className="rules-admin-preview">{blocks.map((b,i) => {
    if (b.type === 'heading') { const level=Math.min(4,Math.max(2,b.level??2)); return level===2?<h2 key={i}>{b.text}</h2>:level===3?<h3 key={i}>{b.text}</h3>:<h4 key={i}>{b.text}</h4>; }
    if (b.type === 'table') return <div className="table-wrap" key={i}><table><tbody>{(b.rows??[]).map((row,j)=><tr key={j}>{row.map((cell,k)=>j===0?<th key={k}>{cell}</th>:<td key={k}>{cell}</td>)}</tr>)}</tbody></table></div>;
    if (b.type === 'list-item') return <div key={i} style={{paddingLeft:Math.min(6,b.level??0)*18+12}} className="rules-admin-list-item">{b.ordered?'1.':'•'} {b.text}</div>;
    return <p key={i}>{b.text}</p>;
  })}</div>;
}

export default function RulesAdminPage() {
  const [settings,setSettings]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [preview,setPreview]=useState<Revision|null>(null);
  const load=async()=>{setLoading(true);setError('');try{const r=await getSiteSettings();setSettings(r.settings);}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить документы');}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);
  const state=(settings?.registration?.rulesDocument??{published:null,publishedVersions:[],drafts:[]}) as DocumentState;
  const saveState=async(next:DocumentState)=>{const registration={...(settings?.registration??{}),rulesDocument:next};const result=await updateSiteSettings({registration});setSettings((s:any)=>({...s,registration:result.settings?.registration??registration}));};
  const chooseFile=async(file?:File)=>{if(!file)return;setError('');setNotice('');setPreview(null);if(file.type!==DOCX_TYPE&&!file.name.toLowerCase().endsWith('.docx')){setError('Выбери файл Word в формате .docx');return;}if(file.size<=0||file.size>10*1024*1024){setError('Размер DOCX должен быть от 1 байта до 10 МБ');return;}setBusy(true);try{const targetId='rules-draft-'+newId();const stored=await uploadRulesDocx(targetId,file);const parsed=await apiPost<any>('/site-settings/rules/preview',{targetId});const draft:Revision={id:newId(),targetId,fileName:file.name,url:stored.url,createdAt:new Date().toISOString(),blocks:parsed.blocks??[]};if(!draft.blocks.length)throw new Error('В документе не найдено содержимое для предпросмотра');const next={...state,drafts:[draft,...(state.drafts??[])].slice(0,10)};await saveState(next);setPreview(draft);setNotice('Документ загружен и разобран. Проверь предпросмотр, прежде чем публиковать.');}catch(e){setError(e instanceof Error?e.message:'Не удалось обработать документ Word');}finally{setBusy(false);}};
  const publish=async(revision:Revision)=>{if(!window.confirm('Опубликовать эту редакцию регламента? Она сразу станет доступна всем посетителям сайта.'))return;setBusy(true);setError('');setNotice('');try{const published={...revision,publishedAt:new Date().toISOString()};const versions=[...(state.publishedVersions??[]),...(state.published?[state.published]:[])];await saveState({published,publishedVersions:versions,drafts:(state.drafts??[]).filter(d=>d.id!==revision.id)});setPreview(null);setNotice('Регламент опубликован на публичном сайте.');}catch(e){setError(e instanceof Error?e.message:'Не удалось опубликовать регламент');}finally{setBusy(false);}};
  const discard=async(revision:Revision)=>{if(!window.confirm('Удалить черновик из списка? Исходный файл в хранилище не удаляется.'))return;setBusy(true);try{await saveState({...state,drafts:(state.drafts??[]).filter(d=>d.id!==revision.id)});if(preview?.id===revision.id)setPreview(null);}catch(e){setError(e instanceof Error?e.message:'Не удалось удалить черновик');}finally{setBusy(false);}};
  if(loading)return <div className="page"><div className="page-heading"><div><h1>Регламент и правила</h1><p>Загрузка документов…</p></div></div></div>;
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">USD · ADMIN PANEL</div><h1>Регламент и правила</h1><p>Импорт Word, проверка структуры и публикация официальной редакции</p></div></div>
    <div className="rules-admin-page">
      <div className="rules-admin-upload card">
        <div className="rules-admin-upload-icon"><UploadCloud size={22}/></div>
        <div><h2>Загрузить регламент Word</h2><p>Поддерживается .docx до 10 МБ. Заголовки, абзацы, списки и таблицы будут разобраны для публичной страницы.</p><label className="primary-button rules-admin-file-button">{busy?<><Loader2 className="spin" size={16}/>Обрабатываем…</>:'Выбрать DOCX'}<input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={e=>{void chooseFile(e.target.files?.[0]);e.currentTarget.value='';}} hidden/></label></div>
      </div>
      {error&&<div className="form-error">{error}</div>}{notice&&<div className="rules-admin-notice"><CheckCircle2 size={17}/>{notice}</div>}
      {state.published&&<section className="card rules-admin-current"><div className="rules-admin-status"><span className="status-dot"/>Опубликовано</div><h2>{state.published.fileName}</h2><p>Дата публикации: {new Date(state.published.publishedAt??state.published.createdAt).toLocaleString('ru-RU')}</p><div className="button-row"><a className="secondary-button" href={state.published.url} target="_blank" rel="noreferrer">Скачать исходный DOCX ↗</a><button className="secondary-button" onClick={()=>setPreview(state.published!)}>Просмотреть содержимое</button></div></section>}
      {preview&&<section className="card rules-admin-preview-card"><div className="rules-admin-preview-head"><div><div className="eyebrow">ПРЕДПУБЛИКАЦИОННАЯ ПРОВЕРКА</div><h2>{preview.fileName}</h2><p>{preview.blocks.length} элементов · исходный документ сохранён</p></div><button className="secondary-button" disabled={busy} onClick={()=>setPreview(null)}>Закрыть</button></div><Preview blocks={preview.blocks}/><div className="button-row"><button className="primary-button" disabled={busy} onClick={()=>void publish(preview)}>Опубликовать редакцию</button><button className="secondary-button" disabled={busy} onClick={()=>void discard(preview)}>Убрать черновик</button></div></section>}
      {(state.drafts??[]).length>0&&<section className="card"><div className="section-heading"><div><h2>Черновики</h2><p>Храним последние 10 черновиков. Публикация требует отдельного подтверждения.</p></div></div><div className="rules-admin-drafts">{state.drafts!.map(d=><div className="rules-admin-draft" key={d.id}><FileText size={19}/><div className="rules-admin-draft-info"><strong>{d.fileName}</strong><span>{new Date(d.createdAt).toLocaleString('ru-RU')} · {d.blocks.length} элементов</span></div><button className="secondary-button" onClick={()=>setPreview(d)}>Предпросмотр</button><button className="secondary-button" disabled={busy} onClick={()=>void publish(d)}>Опубликовать</button></div>)}</div></section>}
      {(state.publishedVersions??[]).length>0&&<section className="card"><div className="section-heading"><div><h2>История опубликованных редакций</h2><p>Архив не ограничен по количеству редакций.</p></div></div><div className="rules-admin-drafts">{[...state.publishedVersions!].reverse().map((d,i)=><div className="rules-admin-draft" key={d.id+'-'+i}><FileClock size={18}/><div className="rules-admin-draft-info"><strong>{d.fileName}</strong><span>{new Date(d.publishedAt??d.createdAt).toLocaleString('ru-RU')}</span></div><a className="secondary-button" href={d.url} target="_blank" rel="noreferrer">Скачать DOCX ↗</a><button className="secondary-button" onClick={()=>setPreview(d)}>Просмотр</button></div>)}</div></section>}
    </div>
  </div>;
}
