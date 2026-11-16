import { useEffect, useState } from 'react';
import { apiGet, apiPatch } from '../api';
import { PUBLICATION_OPTIONS, coerceChoices, emptyChoices, type PublicationChoices } from './publication-consent-model';

type ServerState = {
 choices?: unknown;
 currentVersion?: string|null;
 confirmed?: boolean;
 recordedAt?: string|null;
 publicProfileEnabled?: boolean;
 restrictions?: string;
 publicationPendingReview?: boolean;
};

export default function ParticipantPublicationPreferences() {
 const [choices, setChoices] = useState<PublicationChoices>(emptyChoices);
 const [loaded, setLoaded] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [notice, setNotice] = useState('');
 const [version, setVersion] = useState<string|null>(null);
 const [confirmed, setConfirmed] = useState(false);
 const [restrictions, setRestrictions] = useState('');
 const [pendingReview, setPendingReview] = useState(false);

 useEffect(() => {
   let active = true;
   apiGet<ServerState>('/participants/me/publication-consent')
     .then(result => {
       if (!active) return;
       setChoices(coerceChoices(result.confirmed ? result.choices : null));
       setVersion(result.currentVersion ?? null);
       setConfirmed(result.confirmed === true);
       setRestrictions(result.restrictions ?? '');
       setPendingReview(result.publicationPendingReview === true);
     })
     .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Не удалось получить разрешения на публикацию'); })
     .finally(() => { if (active) setLoaded(true); });
   return () => { active = false; };
 }, []);

 const save = async (next: PublicationChoices) => {
   setBusy(true); setError(''); setNotice('');
   try {
     const result = await apiPatch<ServerState>('/participants/me/publication-consent', { choices: next, restrictions });
     setChoices(coerceChoices(result.choices));
     setConfirmed(result.confirmed === true);
     setPendingReview(result.publicationPendingReview === true);
     setNotice(result.publicationPendingReview
       ? 'Условия сохранены. Публикация приостановлена до проверки организатором.'
       : Object.values(next).some(Boolean)
       ? 'Разрешения сохранены. Публикация ограничена выбранными категориями.'
       : 'Разрешения отозваны. Персональные публикации по этим разрешениям отключены.');
   } catch (e) {
     setError(e instanceof Error ? e.message : 'Не удалось сохранить разрешения');
   } finally { setBusy(false); }
 };

 return <section className="participant-section" aria-labelledby="publication-consent-title">
   <div className="participant-section-head"><div>
     <span className="eyebrow">ПРИВАТНОСТЬ</span>
     <h2 id="publication-consent-title">Публикация данных и фотографий</h2>
     <p>Вы сами выбираете, какие сведения USD вправе публиковать. Все разрешения необязательны.</p>
   </div></div>
   <p>Ознакомьтесь с <a href="/documents/photoProfileConsent" target="_blank" rel="noopener noreferrer">согласием на публикацию профиля и изображений</a>. Один пункт не означает согласие на остальные.</p>
   {!loaded ? <p role="status">Загружаем ваши разрешения…</p> : <>
     {!version && <p role="alert">Организатор пока не утвердил юридическую редакцию. Публикация по этим разрешениям недоступна.</p>}
     {version && !confirmed && <p>Разрешения ещё не подтверждены для текущей редакции документа. Ничего не выбрано заранее.</p>}
     <div className="consent-stack">
       {PUBLICATION_OPTIONS.map(item => <label className="consent-option" key={item.key}>
         <input type="checkbox" checked={choices[item.key]} disabled={busy || !version}
           onChange={e => { setNotice(''); setChoices(old => ({ ...old, [item.key]: e.target.checked })); }} />
         <span>{item.label}</span>
       </label>)}
     </div>
     <label>Дополнительные запреты и условия распространения (необязательно)
       <textarea rows={3} maxLength={4000} value={restrictions} disabled={busy || !version}
         placeholder="Например: запрещаю использовать фотографии в социальных сетях"
         onChange={e => { setRestrictions(e.target.value); setNotice(''); }} />
     </label>
     {pendingReview && <p role="status">Ваши дополнительные ограничения сохранены. Публикация данных и фотографий по этим разрешениям приостановлена до рассмотрения условий организатором.</p>}
     <p><small>Если вы откажетесь от публикации, участие в соревнованиях и личный кабинет сохранятся. Исторические спортивные протоколы могут обрабатываться на самостоятельном законном основании.</small></p>
     {error && <div className="form-error" role="alert">{error}</div>}
     {notice && <p role="status">{notice}</p>}
     <div className="participant-form-actions">
       <button type="button" className="primary-button" disabled={busy || !version}
         onClick={() => void save(choices)}>{busy ? 'Сохраняем…' : 'Сохранить разрешения'}</button>
       <button type="button" className="secondary-button" disabled={busy || !version}
         onClick={() => void save(emptyChoices())}>Отозвать все разрешения</button>
     </div>
   </>}
 </section>;
}
