import {useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,FileText,Loader2,UploadCloud} from 'lucide-react';
import {getSiteSettings,updateSiteSettings,uploadRulesDocx} from '../api';

const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const documents=[
 {key:'privacyPolicy',title:'Политика обработки персональных данных',description:'Публикуемая политика оператора по 152-ФЗ.',filename:'usd-privacy-policy.docx'},
 {key:'personalDataConsent',title:'Согласие на обработку персональных данных',description:'Отдельный текст согласия, не объединённый с пользовательским соглашением.',filename:'usd-personal-data-consent.docx'},
 {key:'termsOfUse',title:'Пользовательское соглашение',description:'Правила использования сайта, учётной записи и сервисов USD.',filename:'usd-terms-of-use.docx'},
 {key:'cookiePolicy',title:'Политика cookie и технических данных',description:'Объясняет необходимые cookie и необязательную аналитику; включайте аналитику только после соответствующей настройки согласия.',filename:'usd-cookie-policy.docx'},
 {key:'newsletterConsent',title:'Согласие на информационные и рекламные рассылки',description:'Добровольное согласие отдельно от регистрации; должно быть возможно отозвать.',filename:'usd-newsletter-consent.docx'},
 {key:'photoProfileConsent',title:'Согласие на публикацию фото и профиля',description:'Отдельное согласие для публикации изображений и профиля; проверьте возраст и объём разрешения.',filename:'usd-photo-profile-consent.docx'},
] as const;
type DocKey=typeof documents[number]['key'];
type StoredDoc={targetId:string;fileName:string;url:string;uploadedAt:string};
function newId(){return globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+Math.random().toString(36).slice(2,12)}

export default function LegalDocumentsPage({PageFrame,PanelTitle,LoadingPage,ErrorPanel}:{PageFrame:React.ComponentType<any>;PanelTitle:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>}){
 const[settings,setSettings]=useState<any>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=async()=>{setLoading(true);setError('');try{const r=await getSiteSettings();setSettings(r.settings)}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить юридические документы')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const legal=settings?.legal??{},stored=(legal.documents??{}) as Partial<Record<DocKey,StoredDoc>>;
 const upload=async(key:DocKey,file?:File)=>{if(!file)return;setError('');setNotice('');if(!file.name.toLowerCase().endsWith('.docx')||(file.type&&file.type!==DOCX)){setError('Выбери документ Microsoft Word в формате .docx');return}if(file.size<=0||file.size>10*1024*1024){setError('Размер файла должен быть от 1 байта до 10 МБ');return}
 setBusy(key);try{const targetId='legal-document-'+key+'-'+newId();const result=await uploadRulesDocx(targetId,file);const nextLegal={...legal,documents:{...stored,[key]:{targetId,fileName:file.name,url:result.url,uploadedAt:new Date().toISOString()}}};const saved=await updateSiteSettings({legal:nextLegal});setSettings((s:any)=>({...s,...saved.settings}));setNotice('Файл загружен. Изменение сбросило юридическое утверждение — после проверки всех документов утверди их в «Настройки сайта → Юридическая информация».')}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить документ')}finally{setBusy(null)}};
 const remove=async(key:DocKey)=>{if(!window.confirm('Убрать ссылку на этот документ? Загруженный объект в хранилище останется, но перестанет отображаться на сайте.'))return;setBusy(key);setError('');setNotice('');try{const next={...stored};delete next[key];const saved=await updateSiteSettings({legal:{...legal,documents:next}});setSettings((s:any)=>({...s,...saved.settings}));setNotice('Ссылка на документ убрана. Юридические документы нужно проверить и утвердить заново.')}catch(e){setError(e instanceof Error?e.message:'Не удалось убрать документ')}finally{setBusy(null)}};
 const saveTexts=async()=>{setSaving(true);setError('');setNotice('');try{const saved=await updateSiteSettings({legal});setSettings((s:any)=>({...s,...saved.settings}));setNotice('Юридические тексты сохранены. Если содержимое менялось, утверждение сброшено.')}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить тексты')}finally{setSaving(false)}};
 if(loading)return <PageFrame title="Юридические документы" subtitle="Публикация документов Word и текстов для посетителей"><LoadingPage/></PageFrame>;
 if(!settings)return <PageFrame title="Юридические документы" subtitle="Публикация документов Word и текстов для посетителей"><ErrorPanel message={error||'Настройки недоступны'} retry={load}/></PageFrame>;
 return <PageFrame title="Юридические документы" subtitle="Загружай DOCX, проверяй тексты и публикуй только утверждённые версии">
  <div className="settings-section">
   <PanelTitle title="Статус публикации" icon={FileText}/>
   <div className={legal.legalApproved===true?'rules-admin-notice':'form-error'}>{legal.legalApproved===true?<><CheckCircle2 size={17}/>Юридические документы утверждены, версия {legal.legalVersion??'—'}. Любое изменение текста или списка файлов должно сбросить утверждение.</>:<><AlertTriangle size={17}/>Документы пока не утверждены. На публичных страницах останется предупреждение, регистрация не должна включаться.</>}</div>
   <p className="settings-help">DOCX-файлы хранятся в медиахранилище. После загрузки открой ссылку и проверь файл. Текстовые версии, которые показываются на страницах /privacy, /consent и /terms, редактируются ниже. Загрузка Word сама по себе не означает юридического утверждения.</p>
  </div>
  <div className="settings-section">
   <PanelTitle title="Файлы Word" icon={UploadCloud}/>
   <div className="settings-form-grid">{documents.map(doc=>{const current=stored[doc.key];return <div key={doc.key} className="settings-field-card" style={{padding:16,border:'1px solid var(--border,#303036)',borderRadius:12,minWidth:0}}>
    <strong>{doc.title}</strong><p className="settings-help">{doc.description}</p>
    {current?<div style={{display:'grid',gap:6,marginBottom:12}}><a href={current.url} target="_blank" rel="noreferrer">{current.fileName||doc.filename} ↗</a><small>Загружен: {current.uploadedAt?new Date(current.uploadedAt).toLocaleString('ru-RU'):'дата не указана'}</small></div>:<p className="settings-help">Файл ещё не загружен.</p>}
    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><label className="primary-button compact" style={{cursor:busy?'wait':'pointer',opacity:busy?0.65:1}}>{busy===doc.key?<><Loader2 size={14} className="spin"/>Загружаем…</>:<><UploadCloud size={14}/>{current?'Заменить DOCX':'Загрузить DOCX'}</>}<input hidden type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={Boolean(busy)} onChange={e=>{void upload(doc.key,e.target.files?.[0]);e.currentTarget.value=''}}/></label>{current&&<button className="secondary-button" disabled={Boolean(busy)} onClick={()=>void remove(doc.key)}>Убрать ссылку</button>}</div>
   </div>})}</div>
  </div>
  <div className="settings-section">
   <PanelTitle title="Тексты публичных страниц" icon={FileText}/>
   <p className="settings-help">Эти тексты отображаются прямо на сайте. Перед утверждением замени все поля в квадратных скобках на реальные сведения оператора, проверь основания, сроки хранения, получателей и используемые сервисы. Не утверждай шаблон с незаполненными полями.</p>
   <div className="settings-form-grid">{([
    ['ipName','Оператор: полное ФИО или наименование','text'],
    ['inn','ИНН оператора','text'],
    ['ogrnip','ОГРНИП (если применимо)','text'],
    ['operatorAddress','Адрес оператора','text'],
    ['personalDataEmail','Email для обращений по персональным данным','text'],
    ['privacyText','Политика обработки персональных данных','textarea'],
    ['consentText','Согласие на обработку персональных данных','textarea'],
    ['termsText','Пользовательское соглашение','textarea'],
   ] as const).map(([key,label,type])=><label key={key} style={{gridColumn:type==='textarea'?'1 / -1':undefined}}><span className="field-label">{label}</span>{type==='textarea'?<textarea rows={10} value={legal[key]??''} onChange={e=>setSettings((s:any)=>({...s,legal:{...s.legal,[key]:e.target.value,legalApproved:false,legalApprovedAt:null,legalApprovedBy:null}}))}/>:<input value={legal[key]??''} onChange={e=>setSettings((s:any)=>({...s,legal:{...s.legal,[key]:e.target.value,legalApproved:false,legalApprovedAt:null,legalApprovedBy:null}}))}/>}</label>)}</div>
   <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}><button className="primary-button compact" disabled={saving} onClick={()=>void saveTexts()}>{saving?<><Loader2 size={14} className="spin"/>Сохраняем…</>:<><CheckCircle2 size={14}/>Сохранить тексты</>}</button></div>
  </div>
  {error&&<div className="form-error" role="alert">{error}</div>}{notice&&<div className="rules-admin-notice" role="status"><CheckCircle2 size={17}/>{notice}</div>}
 </PageFrame>
}
