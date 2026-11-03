import {useEffect,useState} from 'react';
import {apiGet,apiPost,listData} from '../api';
import TeamWorkspace,{TeamPhotoPreview} from '../teams/TeamWorkspace';
import type {PublicTeam,Team,TeamUser} from '../teams/types';
function TeamsPage({PageFrame,ErrorPanel,LoadingPage,Empty}:{PageFrame:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>}){
 const [teams,setTeams]=useState<Team[]>([]),[users,setUsers]=useState<TeamUser[]>([]),[legacy,setLegacy]=useState<PublicTeam[]>([]),[selected,setSelected]=useState(''),[name,setName]=useState(''),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [reviewing,setReviewing]=useState(''),[reviewConfirm,setReviewConfirm]=useState<'approve'|'return'|''>(''),[reviewBusy,setReviewBusy]=useState(false),[reviewError,setReviewError]=useState(''),[reviewNotice,setReviewNotice]=useState('');
 const load=async()=>{
  const [result,directory]=await Promise.all([apiGet<{teams:Team[];users:TeamUser[]}>('/teams/admin'),apiGet<PublicTeam[]>('/teams/public')]);
  if(!Array.isArray(result?.teams)||!Array.isArray(result?.users))throw new Error('Не удалось загрузить список команд. Попробуйте ещё раз.');
  setTeams(result.teams);setUsers(result.users);setLegacy(listData<PublicTeam>(directory).filter(t=>!t.id));
 };
 const refresh=async()=>{setLoading(true);setError('');try{await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить команды')}finally{setLoading(false)}};
 useEffect(()=>{void refresh()},[]);
 const create=async()=>{setBusy(true);setError('');try{const team=await apiPost<Team>('/teams',{name:name.trim()});setName('');await load();setSelected(team.id)}catch(e){setError(e instanceof Error?e.message:'Не удалось создать команду')}finally{setBusy(false)}};
 const filtered=teams.filter(t=>t.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))),current=teams.find(t=>t.id===selected);
 const pendingReviews=teams.flatMap(team=>(team.posts??[])
   .filter(post=>post.status==='IN_REVIEW')
   .map(post=>({teamId:team.id,teamName:team.name,postId:post.id,post})));
 const currentReview=pendingReviews.find(item=>item.postId===reviewing);
 const performReview=async(decision:'approve'|'return')=>{
  if(!currentReview||reviewBusy)return;
  setReviewBusy(true);setReviewError('');setReviewNotice('');
  try{
   // No title, body or gallery is sent: backend moderates the stored snapshot.
   await apiPost('/teams/'+encodeURIComponent(currentReview.teamId)+'/posts/'+encodeURIComponent(currentReview.postId)+'/'+decision,{reviewedAt:currentReview.post.updatedAt});
   await load();
   setReviewNotice(decision==='approve'?'Материал опубликован без изменения проверенного содержимого.':'Материал возвращён в черновик для исправлений.');
   setReviewing('');setReviewConfirm('');
  }catch(e){
   setReviewError(e instanceof Error?e.message:'Не удалось завершить проверку материала. Обновите список.');
  }finally{setReviewBusy(false)}
 };
 return <PageFrame title="Команды" subtitle="Составы, командиры и публикации USD" action={<button className="secondary-button" disabled={loading||busy} onClick={()=>void refresh()}>Обновить</button>}>
 {error&&<ErrorPanel message={error} retry={refresh}/>}
 <section className="panel team-admin-intro"><h2>Управление командами</h2><p>Создайте команду, назначьте командира и проверяйте материалы перед публикацией. Назначение действует только внутри выбранной команды.</p><form className="team-create-form" onSubmit={e=>{e.preventDefault();void create()}}><label>Название новой команды<input aria-label="Название новой команды" value={name} maxLength={120} required onChange={e=>setName(e.target.value)}/></label><button className="primary-button" disabled={busy||!name.trim()}>Создать команду</button></form></section>
 {!loading&&<section className="panel team-review-queue" aria-label="Очередь публикаций команд на проверке">
  <h2>Материалы на проверке · {pendingReviews.length}</h2>
  <p>Проверьте заголовок, полный текст и все фотографии. Подтверждение публикует только сохранённый материал — браузер не заменяет его устаревшей копией.</p>
  {reviewError&&<div className="form-error" role="alert">{reviewError}</div>}
  {reviewNotice&&<div className="notice" role="status">{reviewNotice}</div>}
  {pendingReviews.length?<ul className="team-review-list">{pendingReviews.map(item=><li key={item.postId}>
   <button type="button" aria-expanded={reviewing===item.postId} aria-controls={'usd-team-review-'+item.postId} disabled={reviewBusy} onClick={()=>{setReviewing(reviewing===item.postId?'':item.postId);setReviewConfirm('');setReviewError('')}}>
    <strong>{item.teamName}</strong> · {item.post.title} <span className="team-status">{item.post.kind==='ACHIEVEMENT'?'Достижение':'Новость'}</span>
   </button>
   {reviewing===item.postId&&<div id={'usd-team-review-'+item.postId} className="team-review-detail" aria-label={'Проверка материала '+item.post.title}>
    <h3>{item.post.title}</h3>
    <p className="team-plain-text">{item.post.body}</p>
    {Array.isArray(item.post.images)&&item.post.images.length>0&&<div className="team-post-images" aria-label="Фотографии на проверке">{item.post.images.map((key,i)=><div key={key}><TeamPhotoPreview targetId={key} alt={item.post.title+' · фото '+(i+1)}/></div>)}</div>}
    <p className="team-help">Фотографий: {item.post.images?.length??0}. Если содержание требует правок, верните черновик командиру.</p>
    <div className="team-actions">
     <button type="button" className="primary-button compact" disabled={reviewBusy} onClick={()=>setReviewConfirm('approve')}>Одобрить публикацию</button>
     <button type="button" className="secondary-button compact" disabled={reviewBusy} onClick={()=>setReviewConfirm('return')}>Вернуть на доработку</button>
     <button type="button" className="secondary-button compact" disabled={reviewBusy} onClick={()=>{setSelected(item.teamId);setQuery('')}}>Открыть управление командой</button>
    </div>
    {reviewConfirm&&<div className="team-confirm" role="group" aria-label="Подтверждение решения по публикации">
     <p>{reviewConfirm==='approve'?'Опубликовать именно этот материал вместе с проверенными фотографиями?':'Вернуть материал командиру в черновик, сохранив текст и фотографии?'}</p>
     <div className="team-actions"><button type="button" className={reviewConfirm==='approve'?'primary-button compact':'secondary-button compact'} disabled={reviewBusy} onClick={()=>void performReview(reviewConfirm)}>{reviewBusy?'Сохраняем…':'Подтвердить решение'}</button><button type="button" className="secondary-button compact" disabled={reviewBusy} onClick={()=>setReviewConfirm('')}>Отмена</button></div>
    </div>}
   </div>}
  </li>)}</ul>:<p>Нет материалов, ожидающих решения администратора.</p>}
 </section>}
 {loading?<LoadingPage/>:<div className="team-admin-layout"><section className="panel team-team-list"><label>Найти команду<input aria-label="Найти команду" value={query} onChange={e=>setQuery(e.target.value)}/></label>{filtered.length?<ul>{filtered.map(t=><li key={t.id}><button className={selected===t.id?'is-selected':''} aria-pressed={selected===t.id} onClick={()=>setSelected(t.id)}><strong>{t.name}</strong><span>{t.isActive?'Активна':'В архиве'} · {t.memberships?.filter(m=>m.status==='PENDING').length??0} заявок · {t.posts?.filter(p=>p.status==='IN_REVIEW').length??0} публикаций на проверке</span></button></li>)}</ul>:<Empty text={query?'Команды не найдены':'Создайте первую команду'}/>}</section><section className="panel team-admin-detail">{current?<TeamWorkspace key={current.id} team={current} users={users} admin onChanged={load}/>:<Empty text="Выберите команду для управления составом и публикациями"/>}</section></div>}
 <section className="panel team-archive"><h2>Архивные названия</h2><p>История выступлений сохранена. Архивные связи не означают подтверждённое текущее членство.</p>{legacy.length?<ul>{legacy.map(t=><li key={t.name}><strong>{t.name}</strong><span>{t.historicalMembers.length} публичных участников в архиве</span></li>)}</ul>:<p>Отдельных архивных названий нет.</p>}</section>
 </PageFrame>;
}
export default TeamsPage;
