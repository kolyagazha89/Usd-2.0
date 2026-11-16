import {useEffect,useState} from 'react';
import {apiGet,apiPut} from '../api';

export const PUBLICATION_SCOPES = {
  fullName:'Фамилия, имя, отчество и публичный USD ID',
  city:'Город или населённый пункт',
  team:'Команда и история принадлежности к команде',
  results:'Этап, направление, класс, место, результат и рекорды',
  car:'Марка, модель и общедоступное описание автомобиля',
  profilePhoto:'Фотография профиля',
  carPhoto:'Фотография автомобиля',
  eventImage:'Изображение человека в материалах об этапах',
  promotionalImage:'Изображение человека в рекламных материалах USD',
} as const;
type Scope=keyof typeof PUBLICATION_SCOPES;
type PermissionState=Record<Scope,boolean>;
const EMPTY:PermissionState=Object.fromEntries(Object.keys(PUBLICATION_SCOPES).map(key=>[key,false])) as PermissionState;

export default function PublicationConsentSettings({onSaved}:{onSaved?:()=>void|Promise<void>}) {
  const [selection,setSelection]=useState<PermissionState>({...EMPTY});
  const [version,setVersion]=useState<string|null>(null);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  const [needsReview,setNeedsReview]=useState(false);
  useEffect(()=>{
    let active=true;
    apiGet<any>('/participants/me/publication-consent').then(data=>{
      if(!active)return;
      setVersion(data?.version||null);
      setSelection({...EMPTY,...data?.permissions});
      setNeedsReview(Boolean(data?.needsReview));
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось загрузить настройки публикации')})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[]);
  const save=async()=>{
    setSaving(true);setError('');setMessage('');
    try{
      const result=await apiPut<any>('/participants/me/publication-consent',selection);
      setVersion(result.version);
      setNeedsReview(false);
      setMessage('Настройки сохранены. Неотмеченные категории не разрешены для публикации.');
      await onSaved?.();
    }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить разрешения')}
    finally{setSaving(false)}
  };
  return <section className="participant-section" aria-label="Согласия на публичное распространение">
    <div className="participant-section-head"><div><span className="eyebrow">НЕОБЯЗАТЕЛЬНО</span>
      <h2>Публикация профиля и фотографий</h2>
      <p>Каждую категорию разрешаете отдельно. Все отметки изначально выключены. Отказ не мешает регистрации и выступлению.</p>
    </div></div>
    <p>Прочитайте <a href="/documents/photoProfileConsent" target="_blank" rel="noopener noreferrer">условия согласия на публикацию и использование изображения</a>.</p>
    {loading?<p role="status">Загружаем разрешения…</p>:<>
      {needsReview&&<p role="status">Текст согласия обновлён. Старые разрешения не действуют до повторного подтверждения.</p>}
      {!version&&<p role="alert">Документ ещё не утверждён организатором. Предоставление разрешений временно недоступно.</p>}
      <div className="consent-stack">{(Object.entries(PUBLICATION_SCOPES) as [Scope,string][]).map(([scope,label],index)=>
        <label className="consent-option" key={scope}>
          <input type="checkbox" checked={selection[scope]} disabled={!version||saving}
            onChange={e=>{setSelection(state=>({...state,[scope]:e.target.checked}));setMessage('')}}/>
          <span>{index===7?'Изображение в репортажах: ':index===8?'Изображение в рекламе: ':''}{label}</span>
        </label>)}</div>
      <p><small>Запрет или отзыв можно установить снятием выбранной отметки и сохранением. Для индивидуальных ограничений: usd-russia@yandex.com.</small></p>
      <button className="primary-button" type="button" disabled={!version||saving} onClick={()=>void save()}>
        {saving?'Сохраняем…':'Сохранить мои разрешения'}
      </button>
      {message&&<p role="status">{message}</p>}
    </>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
