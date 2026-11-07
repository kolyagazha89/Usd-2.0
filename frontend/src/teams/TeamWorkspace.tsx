import {useEffect,useState} from 'react';
import {apiPatch,apiPost,uploadTeamPostPhoto,getTeamPostPhotoUrl,getPrivateMediaObjectUrl,releasePrivateMediaUrl} from '../api';
import type {Team,TeamPost,TeamUser} from './types';
import TeamStageAchievements from './TeamStageAchievements';
import './teams.css';
export function TeamPhotoPreview({targetId,alt}:{targetId:string;alt:string}){
 const [url,setUrl]=useState('');
 useEffect(()=>{
  let active=true;let current='';
  getPrivateMediaObjectUrl('SITE_ASSET',targetId).then(value=>{
   if(active){current=value;setUrl(value)}else releasePrivateMediaUrl(value);
  }).catch(()=>{if(active)setUrl('')});
  return()=>{active=false;if(current)releasePrivateMediaUrl(current)};
 },[targetId]);
 return url?<img src={url} alt={alt} loading="lazy"/>:<span role="status">Фото недоступно для просмотра</span>;
}
const postStatus={DRAFT:'Черновик',IN_REVIEW:'На проверке',PUBLISHED:'Опубликовано'};
const emptyPost={kind:'NEWS' as TeamPost['kind'],title:'',body:'',images:[] as string[]};
export default function TeamWorkspace({team,admin=false,users=[],onChanged}:{team:Team;admin?:boolean;users?:TeamUser[];onChanged:()=>Promise<void>}){
 const [name,setName]=useState(team.name),[description,setDescription]=useState(team.description),[commander,setCommander]=useState(team.commanderUserId??'');
 const [section,setSection]=useState<'settings'|'members'|'posts'|'results'>('members');
 const [postStep,setPostStep]=useState<1|2>(1);
 const [draft,setDraft]=useState(emptyPost),[editing,setEditing]=useState(''),[editingStatus,setEditingStatus]=useState<'DRAFT'|'IN_REVIEW'>('DRAFT'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState('');
 useEffect(()=>{setName(team.name);setDescription(team.description);setCommander(team.commanderUserId??'')},[team]);
 const base='/teams/'+encodeURIComponent(team.id);
 const run=async(action:()=>Promise<unknown>,message:string)=>{
  setBusy(true);setError('');setNotice('');
  try{
   // The write and the subsequent list refresh are separate transactions.
   // Never ask the user to repeat a successful write just because refresh failed.
   await action();setConfirm('');
   try{await onChanged();setNotice(message)}
   catch{setNotice(message+' Список пока не обновился. Обновите страницу, чтобы увидеть актуальные данные.');}
  }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить. Обновите данные и повторите действие.')}
  finally{setBusy(false)}
 };
 const addPhotos=async(files:FileList|null)=>{
  if(!files?.length)return;
  if(editingStatus==='IN_REVIEW'){setError('Для новых фотографий сначала верните публикацию в черновик');return}
  const candidates=Array.from(files);
  if(draft.images.length+candidates.length>8){setError('Можно прикрепить не более восьми фотографий');return}
  if(!draft.title.trim()||!draft.body.trim()){
   setError('Для загрузки фотографий сначала заполните заголовок и текст публикации');return;
  }
  setBusy(true);setError('');setNotice('');
  const uploaded:string[]=[];
  let postId=editing;
  let createdNow=false;
  try{
   if(!postId){
    // RustFS requires a real post ID to bind media access and ownership.
    const created=await apiPost<{id:string}>(base+'/posts',{...draft,status:'DRAFT'});
    if(!created?.id)throw new Error('Черновик сохранён, но сервер не вернул его ID. Обновите список публикаций.');
    postId=created.id;createdNow=true;setEditing(postId);
   }
   let uploadError:unknown=null;
   for(const file of candidates){
    try{uploaded.push(await uploadTeamPostPhoto(postId,file))}
    catch(e){uploadError=e;break}
   }
   if(uploaded.length){
    const images=[...draft.images,...uploaded];
    setDraft(current=>({...current,images}));
    // Persist completed uploads immediately, so a refresh cannot orphan media.
    await apiPatch(base+'/posts/'+encodeURIComponent(postId),{...draft,images,status:'DRAFT'});
   }
   if(uploadError)throw uploadError;
   const message=(createdNow?'Черновик создан автоматически. ':'')+'Фотографии загружены и прикреплены к черновику. Текст последующих изменений сохраняется кнопкой «Сохранить черновик».';
   try{await onChanged();setNotice(message)}
   catch{setNotice(message+' Список пока не обновился, но загрузка выполнена.');}
  }catch(e){
   // Successfully uploaded photos stay on the draft even if a later upload fails.
   if(uploaded.length)setDraft(current=>({...current,images:[...current.images,...uploaded]}));
   setError((e instanceof Error?e.message:'Не удалось загрузить фотографию')+
    (uploaded.length?' · '+uploaded.length+' фото загружено. Сохраните черновик, чтобы прикрепить их.':''));
  }
  finally{setBusy(false)}
 };
 const savePost=(status:TeamPost['status'])=>run(async()=>{const path=base+'/posts'+(editing?'/'+encodeURIComponent(editing):'');await (editing?apiPatch:apiPost)(path,{...draft,status});setDraft(emptyPost);setEditing('');setEditingStatus('DRAFT');setPostStep(1)},status==='IN_REVIEW'?'Материал отправлен на проверку':'Черновик сохранён');
 const changePost=(post:TeamPost,status:TeamPost['status'])=>run(
  ()=>status==='PUBLISHED'
   // Publish the stored snapshot, not a stale form copy.
   ?apiPost(base+'/posts/'+encodeURIComponent(post.id)+'/approve',{reviewedAt:post.updatedAt})
   :admin&&post.status==='IN_REVIEW'&&status==='DRAFT'
    ?apiPost(base+'/posts/'+encodeURIComponent(post.id)+'/return',{reviewedAt:post.updatedAt})
    :apiPatch(base+'/posts/'+encodeURIComponent(post.id),{kind:post.kind,title:post.title,body:post.body,status,images:post.images??[]}),
  status==='PUBLISHED'?'Материал опубликован':'Материал возвращён в черновик'
 );
 const active=team.memberships?.filter(m=>['PENDING','APPROVED'].includes(m.status))??[];
 return <section className="team-workspace" aria-label={'Управление командой '+team.name}>
  <header className="team-section-heading"><div><h2>{team.name}</h2><p>{team.isActive?'Активная команда':'Команда в архиве'}</p></div></header>
  {error&&<p role="alert" className="form-error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
  <nav className="team-workspace-sections" aria-label="Разделы управления командой"><button type="button" aria-controls="team-settings-panel" aria-current={section==='settings'?'page':undefined} onClick={()=>setSection('settings')}>Настройки</button><button type="button" aria-controls="team-members-panel" aria-current={section==='members'?'page':undefined} onClick={()=>setSection('members')}>Участники и заявки · {active.length}</button><button type="button" aria-controls="team-posts-panel" aria-current={section==='posts'?'page':undefined} onClick={()=>setSection('posts')}>Новости и достижения</button><button type="button" aria-controls="team-results-panel" aria-current={section==='results'?'page':undefined} onClick={()=>setSection('results')}>Выступления по этапам</button></nav>
  <fieldset disabled={busy||(!admin&&!team.isActive)} className="team-fields">
   <form id="team-settings-panel" hidden={section!=='settings'} className="team-settings" onSubmit={e=>{e.preventDefault();void run(()=>apiPatch(base,{description,...(admin?{name,commanderUserId:commander||null}:{})}),'Команда сохранена')}}>
    {admin&&<label>Название команды<input aria-label="Название команды" value={name} maxLength={120} required onChange={e=>setName(e.target.value)}/></label>}
    <label>Описание команды<textarea aria-label="Описание команды" value={description} maxLength={4000} rows={4} onChange={e=>setDescription(e.target.value)}/></label>
    {admin&&<label>Командир команды<select aria-label="Командир команды" value={commander} onChange={e=>setCommander(e.target.value)}><option value="">Командир не назначен</option>{users.map(u=><option key={u.id} value={u.id}>{u.name?u.name+' · ':''}{u.email}</option>)}</select></label>}
    <div className="team-actions"><button className="primary-button" disabled={!name.trim()}>{busy?'Сохраняем…':'Сохранить команду'}</button>{admin&&<button type="button" className="secondary-button" onClick={()=>setConfirm('archive')}>{team.isActive?'Архивировать команду':'Вернуть из архива'}</button>}</div>
   </form>
   {section==='settings'&&confirm==='archive'&&<div className="team-confirm" role="group" aria-label="Изменение статуса команды"><p>{team.isActive?'Команда перестанет принимать заявки. Управление командиром будет недоступно.':'Команда снова начнёт принимать заявки.'}</p><div className="team-actions"><button type="button" className="primary-button" onClick={()=>void run(()=>apiPatch(base,{isActive:!team.isActive}),'Статус команды обновлён')}>Подтвердить статус</button><button className="secondary-button" onClick={()=>setConfirm('')}>Отмена</button></div></div>}
   <section id="team-members-panel" hidden={section!=='members'} className="team-roster"><h3>Заявки и участники</h3><p className="team-help">Участники раскрывают команде только имя, фамилию и город. Публичная видимость зависит от настроек их профиля.</p>
    {active.length?<ul className="team-member-list">{active.map(m=><li key={m.id}><div><strong>{m.participant.lastName} {m.participant.firstName}</strong><p>{m.participant.city||'Город не указан'} · {m.status==='PENDING'?'Ожидает решения':'В команде'}</p></div><div className="team-actions">{m.status==='PENDING'?<><button className="primary-button compact" onClick={()=>void run(()=>apiPatch(base+'/memberships/'+encodeURIComponent(m.id),{status:'APPROVED'}),'Участник принят')}>Принять</button><button className="secondary-button compact" onClick={()=>void run(()=>apiPatch(base+'/memberships/'+encodeURIComponent(m.id),{status:'REJECTED'}),'Заявка отклонена')}>Отклонить</button></>:confirm===m.id?<><button className="danger-button compact" onClick={()=>void run(()=>apiPatch(base+'/memberships/'+encodeURIComponent(m.id),{status:'LEFT'}),'Участник исключён')}>Подтвердить исключение</button><button className="secondary-button compact" onClick={()=>setConfirm('')}>Отмена</button></>:<button className="secondary-button compact" onClick={()=>setConfirm(m.id)}>Исключить</button>}</div></li>)}</ul>:<p>Заявок и участников пока нет.</p>}
   </section>
   <section id="team-posts-panel" hidden={section!=='posts'} className="team-posts"><h3>Новости и достижения</h3><p className="team-help">Материалы публикует администратор после проверки. Опубликованный текст доступен всем.</p>
    <div className="team-post-list">{team.posts?.map(p=><article key={p.id}><div className="team-section-heading"><h4>{p.title}</h4><span className="team-status">{postStatus[p.status]}</span></div><p className="team-plain-text">{p.body}</p>{Array.isArray(p.images)&&p.images.length>0&&<div className="team-post-images">{p.images.map((key,i)=><div key={key}>{p.status==='PUBLISHED'?<img src={getTeamPostPhotoUrl(key)} loading="lazy" alt={p.title+' · фото '+(i+1)}/>:<TeamPhotoPreview targetId={key} alt={p.title+' · фото '+(i+1)}/>} </div>)}</div>}<div className="team-actions">{(p.status==='DRAFT'||(admin&&p.status==='IN_REVIEW'))&&<button className="secondary-button compact" onClick={()=>{setEditing(p.id);setEditingStatus(p.status==='IN_REVIEW'?'IN_REVIEW':'DRAFT');setPostStep(1);setSection('posts');setDraft({kind:p.kind,title:p.title,body:p.body,images:Array.isArray(p.images)?p.images:[]})}}>Редактировать</button>}{p.status==='IN_REVIEW'&&!admin&&<button className="secondary-button compact" onClick={()=>void changePost(p,'DRAFT')}>Отозвать с проверки</button>}{admin&&(p.status==='PUBLISHED'?<button className="secondary-button compact" onClick={()=>void changePost(p,'DRAFT')}>Снять с публикации</button>:p.status==='IN_REVIEW'?<button className="primary-button compact" onClick={()=>void changePost(p,'PUBLISHED')}>Опубликовать</button>:<button className="secondary-button compact" onClick={()=>void changePost(p,'IN_REVIEW')}>Передать на проверку</button>)}</div></article>)}</div>
    <form className="team-post-editor" onSubmit={e=>{e.preventDefault();if(postStep===1)setPostStep(2);else void savePost('IN_REVIEW')}}><p className="team-help" role="status">Шаг {postStep} из 2 · {postStep===1?'Заполнение':'Проверка перед отправкой'}</p><h4>{editing?'Редактирование материала':'Новый материал'}</h4><div hidden={postStep!==1} className="team-post-fields"><label>Тип материала<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as TeamPost['kind']})}><option value="NEWS">Новость</option><option value="ACHIEVEMENT">Достижение</option></select></label><label>Заголовок публикации<input aria-label="Заголовок публикации" value={draft.title} maxLength={160} required={postStep===1} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>Текст публикации<textarea aria-label="Текст публикации" value={draft.body} maxLength={10000} rows={6} required={postStep===1} onChange={e=>setDraft({...draft,body:e.target.value})}/></label><div className="team-photo-editor"><strong>Фотографии · {draft.images.length}/8</strong><p className="team-help">Добавьте фотографии сразу: при первой загрузке черновик создаётся автоматически. Загруженные снимки сохраняются в черновике сразу и станут публичными только после проверки администратором.{editingStatus==='IN_REVIEW'?' Для добавления фото сначала верните материал в черновик.':''}</p><label>Добавить фотографии<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||editingStatus==='IN_REVIEW'||draft.images.length>=8} onChange={e=>{void addPhotos(e.target.files);e.currentTarget.value=''}}/></label>{draft.images.length>0&&<ol className="team-photo-list">{draft.images.map((key,index)=><li key={key}><div className="team-photo-list-preview"><TeamPhotoPreview targetId={key} alt={'Фото '+(index+1)}/><span>Фотография {index+1}</span></div><button type="button" className="secondary-button compact" onClick={()=>setDraft(current=>({...current,images:current.images.filter(x=>x!==key)}))}>Убрать</button></li>)}</ol>}</div></div>{postStep===2&&<section className="team-post-review" aria-label="Предпросмотр публикации"><p><strong>Тип:</strong> {draft.kind==='NEWS'?'Новость':'Достижение'}</p><h5>{draft.title}</h5><p className="team-plain-text">{draft.body}</p><p>Фотографий: {draft.images.length}</p></section>}<div className="team-actions">{postStep===1?<button className="primary-button" disabled={!draft.title.trim()||!draft.body.trim()}>Проверить публикацию</button>:<><button type="button" className="secondary-button" onClick={()=>setPostStep(1)}>Вернуться к редактированию</button><button className="primary-button" disabled={!draft.title.trim()||!draft.body.trim()}>Подтвердить отправку</button></>}<button type="button" className="secondary-button" disabled={!draft.title.trim()||!draft.body.trim()} onClick={()=>void savePost('DRAFT')}>Сохранить черновик</button>{editing&&<button type="button" className="secondary-button" onClick={()=>{setEditing('');setDraft(emptyPost);setEditingStatus('DRAFT');setPostStep(1)}}>Отменить редактирование</button>}</div></form>
   </section>
  </fieldset>
  <section id="team-results-panel" hidden={section!=='results'} className="team-results-panel" aria-label="Статистика выступлений команды">
   {section==='results'&&<><TeamStageAchievements teamId={team.id} mode="inspected"/><TeamStageAchievements teamId={team.id} mode="current"/></>}
  </section>
 </section>;
}
