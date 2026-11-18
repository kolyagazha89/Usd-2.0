import {useCallback,useEffect,useState} from 'react';
import {apiGet} from '../api';

type RegistrationPreview = {
  stageId: string;
  registeredParticipants: number;
  nextAvailablePrimaryNumber: number;
  provisional: true;
  observedAt: string;
};

/** This is an estimate shown at the registration review step, NOT a reservation. */
export default function RegistrationNumberPreview({stageId}:{stageId:string}){
  const [preview,setPreview]=useState<RegistrationPreview|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const reload=useCallback(()=>setRevision(value=>value+1),[]);
  useEffect(()=>{
    if(!stageId)return;
    let active=true;
    setPreview(null);setBusy(true);setError('');
    apiGet<RegistrationPreview>('/registrations/stage/'+encodeURIComponent(stageId)+'/preview')
      .then(data=>{
        if(!active)return;
        if(data?.stageId!==stageId||!Number.isSafeInteger(data.registeredParticipants)||
          data.registeredParticipants<0||!Number.isSafeInteger(data.nextAvailablePrimaryNumber)||
          data.nextAvailablePrimaryNumber<1||data.provisional!==true)
          throw new Error('Некорректный ответ сервера');
        setPreview(data);
      })
      .catch(()=>{if(active)setError('Не удалось получить актуальные номера. Сама регистрация доступна.')})
      .finally(()=>{if(active)setBusy(false)});
    return()=>{active=false};
  },[stageId,revision]);
  return <section className="registration-number-preview" aria-label="Предварительный номер и количество участников">
    <div className="registration-number-preview-heading">
      <div><strong>Кто уже зарегистрировался</strong><small>Информация перед отправкой заявки</small></div>
      <button type="button" className="registration-number-refresh" disabled={busy} onClick={reload}>Обновить</button>
    </div>
    {busy?<p role="status">Проверяем количество участников и свободные номера…</p>
    :preview?<div className="registration-number-preview-grid">
      <div><span>Зарегистрировано участников</span><strong>{preview.registeredParticipants}</strong></div>
      <div><span>Ваш возможный номер</span><strong>№ {preview.nextAvailablePrimaryNumber}</strong></div>
    </div>
    :<p role="status">{error||'Предварительные данные пока недоступны.'}</p>}
    <p className="registration-number-preview-warning"><strong>Номер предварительный.</strong> Он может поменяться,
      если другой участник завершит регистрацию быстрее. Номер окончательно присваивается только после успешной
      отправки заявки. BassRace может получить отдельные номера.</p>
  </section>;
}
