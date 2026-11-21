import {useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,FileText,Loader2,UploadCloud} from 'lucide-react';
import {apiPost,getSiteSettings,updateSiteSettings,uploadRulesDocx} from '../api';
import {DocumentBlocks,type Block} from '../public/PublicDocumentReader';
import {missingLegalDocuments,planLegalReleaseTexts,planLegalReleaseUpload} from './legal-release-readiness';

const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const documents=[
 {key:'privacyPolicy',title:'Политика обработки персональных данных',description:'Публикуемая политика оператора по 152-ФЗ.',filename:'usd-privacy-policy.docx'},
 {key:'personalDataConsent',title:'Согласие на обработку персональных данных',description:'Отдельный текст согласия, не объединённый с пользовательским соглашением.',filename:'usd-personal-data-consent.docx'},
 {key:'termsOfUse',title:'Пользовательское соглашение',description:'Правила использования сайта, учётной записи и сервисов USD.',filename:'usd-terms-of-use.docx'},
 {key:'cookiePolicy',title:'Политика cookie и технических данных',description:'Объясняет необходимые cookie и необязательную аналитику; включайте аналитику только после соответствующей настройки согласия.',filename:'usd-cookie-policy.docx'},
 {key:'newsletterConsent',title:'Согласие на информационные и рекламные рассылки',description:'Добровольное согласие отдельно от регистрации; должно быть возможно отозвать.',filename:'usd-newsletter-consent.docx'},
 {key:'photoProfileConsent',title:'Согласие на публикацию фото и профиля',description:'Отдельное согласие для публикации изображений и профиля; проверьте возраст и объём разрешения.',filename:'usd-photo-profile-consent.docx'},
 {key:'officialProtocolConsent',title:'Согласие на публикацию официальных протоколов',description:'Отдельный утверждаемый текст по ст. 10.1 № 152-ФЗ: категории ФИО и спортивных результатов, условия, запреты, отзыв и срок.',filename:'usd-official-protocol-consent.docx'},
] as const;
type DocKey=typeof documents[number]['key'];
type StoredDoc={targetId:string;fileName:string;url:string;uploadedAt:string};
function newId(){return globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+Math.random().toString(36).slice(2,12)}

export default function LegalDocumentsPage({PageFrame,PanelTitle,LoadingPage,ErrorPanel}:{PageFrame:React.ComponentType<any>;PanelTitle:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>}){
 const[settings,setSettings]=useState<any>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pendingRemoval,setPendingRemoval]=useState<DocKey|null>(null);
 const[preview,setPreview]=useState<{key:DocKey;blocks:Block[]}|null>(null),[previewBusy,setPreviewBusy]=useState<DocKey|null>(null);
 const load=async()=>{setLoading(true);setError('');try{const r=await getSiteSettings();setSettings(r.settings)}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить юридические документы')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const showPreview=async(key:DocKey,targetId:string)=>{
  setPreviewBusy(key);setError('');setPreview(null);
  try{
   const result=await apiPost<{success:boolean;blocks:Block[]}>('/site-settings/rules/preview',{targetId});
   if(!result.blocks?.length)throw new Error('В документе нет текста для предпросмотра');
   setPreview({key,blocks:result.blocks});
  }catch(e){setError(e instanceof Error?e.message:'Не удалось прочитать Word-файл')}
  finally{setPreviewBusy(null)}
 };
 const legal=settings?.legal??{},stored=(legal.documents??{}) as Partial<Record<DocKey,StoredDoc>>;
 const missingDocuments=missingLegalDocuments(documents,stored);
 const releaseReady=legal.legalApproved===true&&missingDocuments.length===0;
 const upload=async(key:DocKey,file?:File)=>{if(!file)return;setError('');setNotice('');if(!file.name.toLowerCase().endsWith('.docx')||(file.type&&file.type!==DOCX)){setError('Выбери документ Microsoft Word в формате .docx');return}if(file.size<=0||file.size>10*1024*1024){setError('Размер файла должен быть от 1 байта до 10 МБ');return}
 setBusy(key);try{const targetId='legal-document-'+key+'-'+newId();const result=await uploadRulesDocx(targetId,file);const nextLegal={...legal,documents:{...stored,[key]:{targetId,fileName:file.name,url:result.url,uploadedAt:new Date().toISOString()}}};const saved=await updateSiteSettings({legal:nextLegal});setSettings((s:any)=>({...s,...saved.settings}));setPreview(null);setNotice('Файл загружен. Изменение сбросило юридическое утверждение — после проверки всех документов утверди их в «Настройки сайта → Юридическая информация».')}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить документ')}finally{setBusy(null)}};
 const uploadRelease=async(files:File[])=>{
  if(!files.length)return;
  setError('');setNotice('');
  let planned:Array<{key:string;file:File}>;
  try{planned=planLegalReleaseUpload(files,documents)}
  catch(e){setError(e instanceof Error?e.message:'Выберите 7 файлов Word из публичной папки комплекта 1.8');return}
  setBusy('release-bundle');
  try{
   const nextDocuments:{[key:string]:StoredDoc}={...stored};
   for(const {key,file} of planned){
    const targetId='legal-document-'+key+'-'+newId();
    const uploaded=await uploadRulesDocx(targetId,file);
    nextDocuments[key]={targetId,fileName:file.name,url:uploaded.url,uploadedAt:new Date().toISOString()};
   }
   // Save the complete set in one CMS update, never approve it implicitly.
   const saved=await updateSiteSettings({legal:{...legal,documents:nextDocuments,legalApproved:false,legalApprovedAt:null,legalApprovedBy:null}});
   setSettings((s:any)=>({...s,...saved.settings}));setPreview(null);
   setNotice('Все 7 Word-документов загружены. Откройте предпросмотр, проверьте тексты и утвердите комплект в юридических настройках. Регистрация до утверждения остаётся заблокированной.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить комплект: утверждение не выполнялось. Повторите загрузку.')}
  finally{setBusy(null)}
 };
 const importReleaseTexts=async(files:File[])=>{
  if(!files.length)return;
  setError('');setNotice('');
  let planned:Array<{key:'privacyText'|'consentText'|'termsText';file:File}>;
  try{planned=planLegalReleaseTexts(files)}
  catch(e){setError(e instanceof Error?e.message:'Выберите 3 TXT-файла из папки CMS комплекта 1.8');return}
  setBusy('release-texts');
  try{
   const values:Record<'privacyText'|'consentText'|'termsText',string>={
    privacyText:'',consentText:'',termsText:'',
   };
   for(const {key,file} of planned){
    const value=(await file.text()).replace(/^\uFEFF/,'').trim();
    if(value.length<500||!value.includes('редакция 1.8'))
     throw new Error('Неожиданный текст или редакция файла '+file.name+'. Используйте оригиналы комплекта 1.8.');
    values[key]=value;
   }
   // The CMS approval must stay false until the operator reviews both
   // the 7 uploaded Word documents and these three exact public texts.
   const saved=await updateSiteSettings({legal:{...legal,...values,legalApproved:false,legalApprovedAt:null,legalApprovedBy:null}});
   setSettings((s:any)=>({...s,...saved.settings}));
   setNotice('Политика, согласие и пользовательское соглашение обновлены до редакции 1.8. Проверьте тексты ниже, затем утвердите все юридические документы.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось импортировать юридические тексты')}
  finally{setBusy(null)}
 };
 const remove=async(key:DocKey)=>{setPendingRemoval(null);setBusy(key);setError('');setNotice('');try{const next={...stored};delete next[key];const saved=await updateSiteSettings({legal:{...legal,documents:next}});setSettings((s:any)=>({...s,...saved.settings}));setPreview(null);setNotice('Ссылка на документ убрана. Юридические документы нужно проверить и утвердить заново.')}catch(e){setError(e instanceof Error?e.message:'Не удалось убрать документ')}finally{setBusy(null)}};
 const saveTexts=async()=>{setSaving(true);setError('');setNotice('');try{const saved=await updateSiteSettings({legal});setSettings((s:any)=>({...s,...saved.settings}));setNotice('Юридические тексты сохранены. Если содержимое менялось, утверждение сброшено.')}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить тексты')}finally{setSaving(false)}};
 if(loading)return <PageFrame title="Юридические документы" subtitle="Публикация документов Word и текстов для посетителей"><LoadingPage/></PageFrame>;
 if(!settings)return <PageFrame title="Юридические документы" subtitle="Публикация документов Word и текстов для посетителей"><ErrorPanel message={error||'Настройки недоступны'} retry={load}/></PageFrame>;
 return <PageFrame title="Юридические документы" subtitle="Загружай DOCX, проверяй тексты и публикуй только утверждённые версии">
  <div className="settings-section">
   <PanelTitle title="Статус публикации" icon={FileText}/>
   <div className={releaseReady?'rules-admin-notice':'form-error'}>{releaseReady?<><CheckCircle2 size={17}/>Юридические документы утверждены, версия {legal.legalVersion??'—'}. Все 7 обязательных Word-документов указаны. Любое изменение текста или списка файлов сбрасывает утверждение.</>:<><AlertTriangle size={17}/>{missingDocuments.length?'Перед запуском регистрации загрузите документы: '+missingDocuments.join(', ')+'. ':''}{legal.legalApproved===true?'Прежнее утверждение не означает готовность полного комплекта.':'Комплект ещё не утверждён оператором.'} После загрузки проверьте тексты и утвердите редакцию в «Настройки сайта → Юридическая информация».</>}</div>
   <p className="settings-help">DOCX-файлы хранятся в медиахранилище. После загрузки нажми «Просмотреть текст»: предпросмотр доступен и до утверждения. Текстовые версии, которые показываются на страницах /privacy, /consent и /terms, редактируются ниже. Загрузка Word сама по себе не означает юридического утверждения.</p>
  </div>
  <div className="settings-section">
   <PanelTitle title="Файлы Word" icon={UploadCloud}/>
   <div className="settings-field-card" style={{padding:16,marginBottom:16}}>
    <strong>Пакет юридических документов USD · редакция 1.8</strong>
    <p className="settings-help">Распакуйте архив релиза и выберите сразу все семь Word-файлов из папки «01_ПУБЛИЧНЫЕ_DOCX_ДЛЯ_АДМИНКИ». Файлы автоматически сопоставятся с нужными разделами. Внутренние документы не загружайте.</p>
    <label className="primary-button compact" style={{cursor:busy?'wait':'pointer',opacity:busy?0.65:1}}>
      {busy==='release-bundle'?<><Loader2 size={14} className="spin"/>Загружаем 7 DOCX…</>:<><UploadCloud size={14}/>Загрузить комплект из 7 DOCX</>}
      <input hidden type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple disabled={Boolean(busy)}
       onChange={e=>{const files=Array.from(e.currentTarget.files??[]);e.currentTarget.value='';void uploadRelease(files)}}/>
    </label>
    <p className="settings-help">Загрузка не означает юридического утверждения; оно выполняется после проверки содержания.</p>
   </div>
   <div className="settings-form-grid">{documents.map(doc=>{const current=stored[doc.key];return <details key={doc.key} className="settings-field-card" style={{padding:16,border:'1px solid var(--border,#303036)',borderRadius:12,minWidth:0}}>
    <summary><strong>{doc.title}</strong> · {current?'Загружен':'Нет файла'}</summary><p className="settings-help">{doc.description}</p>
    {current?<div style={{display:'grid',gap:6,marginBottom:12}}>
     <strong>{current.fileName||doc.filename}</strong>
     <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
      <button type="button" className="secondary-button compact" disabled={Boolean(previewBusy)||Boolean(busy)} onClick={()=>void showPreview(doc.key,current.targetId)}>{previewBusy===doc.key?'Загружаем…':'Просмотреть текст'}</button>
      {legal.legalApproved===true&&<a className="secondary-button compact" href={current.url}>Скачать DOCX ↓</a>}
     </div>
     <small>Загружен: {current.uploadedAt?new Date(current.uploadedAt).toLocaleString('ru-RU'):'дата не указана'}</small>
    </div>:<p className="settings-help">Файл ещё не загружен.</p>}
    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><label className="primary-button compact" style={{cursor:busy?'wait':'pointer',opacity:busy?0.65:1}}>{busy===doc.key?<><Loader2 size={14} className="spin"/>Загружаем…</>:<><UploadCloud size={14}/>{current?'Заменить DOCX':'Загрузить DOCX'}</>}<input hidden type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={Boolean(busy)} onChange={e=>{void upload(doc.key,e.target.files?.[0]);e.currentTarget.value=''}}/></label>{current&&(pendingRemoval===doc.key?<span className="inline-confirm-actions"><span>Убрать ссылку? Файл сохранится в хранилище.</span><button className="danger-button compact" type="button" disabled={Boolean(busy)} onClick={()=>void remove(doc.key)}>Подтвердить</button><button className="secondary-button compact" type="button" onClick={()=>setPendingRemoval(null)}>Отмена</button></span>:<button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={()=>setPendingRemoval(doc.key)}>Убрать ссылку</button>)}</div>
   </details>})}</div>
   {preview&&<section className="settings-field-card" aria-label="Предпросмотр документа Word" style={{padding:20,marginTop:18,maxHeight:650,overflow:'auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:12}}>
     <h3>Предпросмотр: {documents.find(doc=>doc.key===preview.key)?.title}</h3>
     <button type="button" className="secondary-button compact" onClick={()=>setPreview(null)}>Закрыть</button>
    </div>
    <DocumentBlocks blocks={preview.blocks}/>
   </section>}
  </div>
  <div className="settings-section">
   <PanelTitle title="Тексты публичных страниц" icon={FileText}/>
   <div className="settings-field-card" style={{padding:16,marginBottom:16}}>
    <strong>Тексты публичных страниц · редакция 1.8</strong>
    <p className="settings-help">Из папки «03_ТЕКСТЫ_ДЛЯ_CMS» опубликованного комплекта выберите одновременно privacyText.txt, consentText.txt и termsText.txt. Это обновит тексты на сайте в одной операции, без автоматического юридического утверждения.</p>
    <label className="primary-button compact" style={{cursor:busy?'wait':'pointer',opacity:busy?0.65:1}}>
      {busy==='release-texts'?<><Loader2 size={14} className="spin"/>Импортируем 3 TXT…</>:<><UploadCloud size={14}/>Загрузить 3 текста для сайта</>}
      <input hidden type="file" accept=".txt,text/plain" multiple disabled={Boolean(busy)}
       onChange={e=>{const files=Array.from(e.currentTarget.files??[]);e.currentTarget.value='';void importReleaseTexts(files)}}/>
    </label>
   </div>

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
