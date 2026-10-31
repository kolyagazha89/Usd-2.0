import {ArrowRight,CarFront,CheckCircle2,ChevronRight,Clock3,History,LogOut,Search,ShieldCheck,Sparkles,UserRound,UserRoundPlus,Users,X} from 'lucide-react';
import './first-login-onboarding.css';

type Candidate={
 id:string;
 firstName?:string|null;lastName?:string|null;middleName?:string|null;
 team?:string|null;city?:string|null;canSelfLink?:boolean;
 cars?:Array<{brand?:string|null;model?:string|null;registrationNumber?:string|null}>|null;
 _count?:{registrations?:number|null}|null;
};

type FirstLoginOnboardingProps={
 email:string;
 portalLogo:string;
 canAccessAdmin:boolean;
 searchName:string;
 candidates:Candidate[];
 loading:boolean;
 hasSearchedProfiles:boolean;
 confirmNewProfile:boolean;
 newLastName:string;
 newFirstName:string;
 newMiddleName:string;
 error:string;
 onGoSite:()=>void;
 onGoAdmin:()=>void;
 onLogout:()=>Promise<void>;
 onSearchNameChange:(value:string)=>void;
 onSearch:()=>void;
 onLink:(id:string)=>void;
 onCreate:()=>void;
 onCancelCreate:()=>void;
 onNewLastNameChange:(value:string)=>void;
 onNewFirstNameChange:(value:string)=>void;
 onNewMiddleNameChange:(value:string)=>void;
};

const readableName=(c:Candidate)=>[c.lastName,c.firstName,c.middleName].filter(Boolean).join(' ')||'Участник USD';
const readableCar=(car:NonNullable<Candidate['cars']>[number])=>
 [car.brand,car.model].filter(Boolean).join(' ')+(car.registrationNumber?' · '+car.registrationNumber:'');
const canOfferNewProfile=(name:string)=>name.trim().split(/\s+/).filter(Boolean).length>=2;

export default function FirstLoginOnboarding({
 email,portalLogo,canAccessAdmin,searchName,candidates,loading,hasSearchedProfiles,
 confirmNewProfile,newLastName,newFirstName,newMiddleName,error,
 onGoSite,onGoAdmin,onLogout,onSearchNameChange,onSearch,onLink,onCreate,onCancelCreate,
 onNewLastNameChange,onNewFirstNameChange,onNewMiddleNameChange,
}:FirstLoginOnboardingProps){
 const searched=hasSearchedProfiles&&!loading;
 const canCreate=searched&&canOfferNewProfile(searchName);
 const searchReady=searchName.trim().length>=2;
 return <div className="profile-match-page usd-member">
  <div className="profile-match-shell">
   <header className="profile-match-brand">
    <button type="button" className="profile-match-logo" onClick={onGoSite} aria-label="Перейти на официальный сайт USD">
     <img src={portalLogo||'/usd/usd-original.png'} alt="USD"/>
     <span><strong>USD</strong><small>ЛИЧНЫЙ КАБИНЕТ</small></span>
    </button>
    <div className="profile-match-header-actions">
     <span className="profile-match-email" title={email}>{email}</span>
     {canAccessAdmin&&<button type="button" className="profile-match-header-button" onClick={onGoAdmin}>Админ-панель <ChevronRight size={15}/></button>}
     <button type="button" className="profile-match-header-button" onClick={onGoSite}>На сайт <ArrowRight size={15}/></button>
     <button type="button" className="profile-match-header-button profile-match-logout" onClick={()=>void onLogout()}><LogOut size={15}/> Выйти</button>
    </div>
   </header>
   <main className="profile-match-main" id="profile-match-main">
    <section className="profile-match-hero" aria-labelledby="profile-match-title">
     <div className="profile-match-hero-copy">
      <div className="profile-match-kicker"><span className="profile-match-kicker-dot" aria-hidden="true"/> USD · НАЧАЛО ВАШЕЙ ИСТОРИИ</div>
      <h1 id="profile-match-title">Все ваши выступления.<span>Один профиль USD.</span></h1>
      <p>Приветствуем в USD. Найдите себя в истории соревнований и сохраните свои результаты, рекорды и автомобили в одном личном кабинете. Вы участвуете впервые? Создадим новый профиль.</p>
      <div className="profile-match-hero-benefits">
       <span><History size={17} aria-hidden="true"/> Архив выступлений</span>
       <span><CarFront size={17} aria-hidden="true"/> Ваши автомобили</span>
       <span><Users size={17} aria-hidden="true"/> Рекорды и достижения</span>
      </div>
     </div>
     <aside className="profile-match-hero-journey" aria-label="Как начать пользоваться USD">
      <div className="profile-match-journey-head"><span>ПЕРВЫЙ ВХОД</span><strong>01 <i>/ 02</i></strong></div>
      <ol className="profile-match-onboarding-steps">
       <li className="is-current"><span className="profile-match-step-number">01</span><div><strong>Найти свой профиль</strong><small>По имени или фамилии</small></div><CheckCircle2 size={19} aria-hidden="true"/></li>
       <li><span className="profile-match-step-number">02</span><div><strong>Подтвердить или создать</strong><small>Чтобы сохранить вашу историю</small></div><ArrowRight size={18} aria-hidden="true"/></li>
      </ol>
      <div className="profile-match-journey-note"><ShieldCheck size={17} aria-hidden="true"/><span>История выступлений привязывается только к владельцу профиля.</span></div>
     </aside>
    </section>

    <section className="profile-match-search" aria-labelledby="profile-match-search-title">
     <div className="profile-match-search-heading">
      <span className="profile-match-section-icon"><Search size={22} aria-hidden="true"/></span>
      <div><span className="profile-match-section-kicker">ШАГ 01 · ПОИСК</span><h2 id="profile-match-search-title">Найдём вас в USD</h2><p>Начните с фамилии, имени или части ФИО — полное имя указывать необязательно.</p></div>
     </div>
     <form onSubmit={e=>{e.preventDefault();if(searchReady&&!loading)onSearch()}} aria-busy={loading}>
      <label htmlFor="historical-profile-name">Имя или фамилия участника</label>
      <div className="profile-match-search-row">
       <span className="profile-match-input-icon"><UserRound size={19} aria-hidden="true"/></span>
       <input id="historical-profile-name" type="search" autoComplete="name" enterKeyHint="search"
        value={searchName} onChange={e=>onSearchNameChange(e.target.value)}
        placeholder="Например, Иванов Иван" aria-describedby="profile-match-search-hint"
        minLength={2} spellCheck={false}/>
       {searchName&&<button type="button" className="profile-match-clear" onClick={()=>onSearchNameChange('')} aria-label="Очистить имя"><X size={17}/></button>}
       <button type="submit" className="primary-button profile-match-submit" disabled={loading||!searchReady}>
        {loading?'Ищем совпадения…':'Найти профиль'} <ArrowRight size={18} aria-hidden="true"/>
       </button>
      </div>
      <small id="profile-match-search-hint">Поиск не изменяет данные. Вы сами выберете свою запись перед привязкой.</small>
     </form>
     {error&&<div className="form-error profile-match-error" role="alert">{error}</div>}
    </section>

    {searched&&<section className="profile-match-results" aria-labelledby="profile-match-results-title" aria-live="polite">
     <div className="profile-match-results-heading">
      <div><span className="profile-match-section-kicker">ШАГ 02 · РЕЗУЛЬТАТЫ</span><h2 id="profile-match-results-title">{candidates.length?'Проверьте найденные профили':'Совпадений пока нет'}</h2>
       <p>{candidates.length?'Сравните ФИО, город, команду и автомобиль перед выбором.':'Попробуйте поискать по другой части имени или фамилии.'}</p></div>
      <span className="profile-match-results-count">{candidates.length===100?'100+':candidates.length} <small>найдено</small></span>
     </div>
     {candidates.length>0?<div className="profile-match-list">
      {candidates.map(c=><article className="historical-match-card" key={c.id}>
       <div className="historical-match-identity" aria-hidden="true"><UserRound size={24}/></div>
       <div className="historical-match-main">
        <strong>{readableName(c)}</strong>
        <span>{[c.team,c.city].filter(Boolean).join(' · ')||'Участник USD'}</span>
        <div className="historical-match-meta">
         <span><Clock3 size={13} aria-hidden="true"/>{c._count?.registrations??0} выступлений</span>
         {(c.cars??[]).length>0&&<span><CarFront size={13} aria-hidden="true"/>{c.cars!.slice(0,2).map(readableCar).join(' / ')}</span>}
        </div>
       </div>
       {c.canSelfLink?
        <button type="button" className="primary-button compact profile-match-action" onClick={()=>onLink(c.id)} disabled={loading}>Это мой профиль <ChevronRight size={16}/></button>
        :<div className="historical-match-unavailable"><span><ShieldCheck size={16} aria-hidden="true"/> Требуется подтверждение</span><small>Эта запись уже защищена. Обратитесь к организатору USD для проверки принадлежности.</small></div>}
      </article>)}
     </div>:<div className="profile-match-empty"><Search size={23} aria-hidden="true"/><p>Например, если «Иванов Иван» не найден, попробуйте «Иван» или другую форму фамилии.</p></div>}
    </section>}

    {canCreate&&<section className="profile-match-new" aria-labelledby="profile-match-new-title">
     <div className="profile-match-new-heading"><span className="profile-match-new-icon"><UserRoundPlus size={23} aria-hidden="true"/></span><div><span className="profile-match-section-kicker">НОВЫЙ УЧАСТНИК</span><h2 id="profile-match-new-title">Впервые в USD?</h2><p>Если ни один найденный профиль не ваш, создайте новый. Предыдущие выступления другого участника к нему не добавятся.</p></div></div>
     {confirmNewProfile&&<div className="profile-match-new-fields">
      <label>Фамилия<input value={newLastName} onChange={e=>onNewLastNameChange(e.target.value)} autoComplete="family-name" placeholder="Иванов" required/></label>
      <label>Имя<input value={newFirstName} onChange={e=>onNewFirstNameChange(e.target.value)} autoComplete="given-name" placeholder="Иван" required/></label>
      <label>Отчество (необязательно)<input value={newMiddleName} onChange={e=>onNewMiddleNameChange(e.target.value)} autoComplete="additional-name" placeholder="Иванович"/></label>
      <p role="status" className="profile-match-new-warning"><ShieldCheck size={17} aria-hidden="true"/> Создаётся отдельный профиль. Убедитесь, что выбранные выше записи действительно вам не принадлежат.</p>
     </div>}
     <div className="profile-match-new-actions">
      <button type="button" className={confirmNewProfile?'primary-button':'secondary-button'} onClick={onCreate} disabled={loading||confirmNewProfile&&(!newLastName.trim()||!newFirstName.trim())}>{confirmNewProfile?'Подтвердить создание профиля':'Создать новый профиль'} <ArrowRight size={18} aria-hidden="true"/></button>
      {confirmNewProfile&&<button type="button" className="profile-match-cancel" onClick={onCancelCreate}>Вернуться к найденным</button>}
     </div>
    </section>}

    <section className="profile-match-help" aria-label="Подсказка для первого входа">
     <Sparkles size={21} aria-hidden="true"/>
     <div><strong>Почему это важно?</strong><p>Один профиль объединяет вашу историю соревнований. Не создавайте дубль, если уже выступали в USD. Настройки аккаунта будут доступны в личном кабинете после выбора профиля.</p></div>
    </section>
   </main>
   <footer className="profile-match-footer"><span>© USD · Официальная история соревнований</span><span>ULTIMATE SOUND DESTRUCTION</span></footer>
  </div>
 </div>;
}
