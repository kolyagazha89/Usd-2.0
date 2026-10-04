import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  CarFront,
  ChevronRight,
  ClipboardCheck,
  Database,
  FileClock,
  FileInput,
  Flag,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings2,
  ShieldAlert,
  Trophy,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { getDashboard, getDataQuality, login, logout, me, refresh, type Dashboard, type Role, type User } from './api';

const nav = [
  { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, roles: ['ADMIN', 'JUDGE'] },
  { label: 'Участники', path: '/admin/participants', icon: Users, roles: ['ADMIN'] },
  { label: 'Автомобили', path: '/admin/cars', icon: CarFront, roles: ['ADMIN'] },
  { label: 'Сезоны', path: '/admin/seasons', icon: CalendarDays, roles: ['ADMIN'] },
  { label: 'Этапы', path: '/admin/stages', icon: Flag, roles: ['ADMIN', 'JUDGE'] },
  { label: 'Классы', path: '/admin/classes', icon: Gauge, roles: ['ADMIN'] },
  { label: 'Регистрации', path: '/admin/registrations', icon: ClipboardCheck, roles: ['ADMIN', 'JUDGE'] },
  { label: 'Инспекции', path: '/admin/inspections', icon: ShieldAlert, roles: ['ADMIN', 'JUDGE'] },
  { label: 'Результаты', path: '/admin/results', icon: Trophy, roles: ['ADMIN', 'JUDGE'] },
  { label: 'Дисквалификации', path: '/admin/disqualifications', icon: AlertTriangle, roles: ['ADMIN'] },
  { label: 'История результатов', path: '/admin/historical-results', icon: History, roles: ['ADMIN'] },
  { label: 'Импорт', path: '/admin/import', icon: FileInput, roles: ['ADMIN'] },
  { label: 'Рекорды', path: '/admin/records', icon: Trophy, roles: ['ADMIN', 'JUDGE'] },
  { label: 'Статистика', path: '/admin/statistics', icon: BarChart3, roles: ['ADMIN', 'JUDGE'] },
  { label: 'Пользователи', path: '/admin/users', icon: UserRound, roles: ['ADMIN'] },
  { label: 'Аудит', path: '/admin/audit', icon: FileClock, roles: ['ADMIN'] },
  { label: 'Контроль данных', path: '/admin/data-quality', icon: Database, roles: ['ADMIN'] },
];

const roleName: Record<Role, string> = {
  ADMIN: 'Администратор',
  JUDGE: 'Судья',
  PARTICIPANT: 'Участник',
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [path, setPath] = useState(window.location.pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const boot = async () => {
      const session = await refresh();
      if (session) setUser(session.user);
      else {
        try { setUser(await me()); } catch { setUser(null); }
      }
      setBooting(false);
    };
    void boot();
  }, []);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (next: string) => {
    window.history.pushState({}, '', next);
    setPath(next);
    setMobileOpen(false);
  };

  if (booting) return <Splash />;

  if (!user) {
    return <LoginScreen onLogin={async (email, password) => setUser(await login(email, password))} />;
  }

  if (user.role === 'PARTICIPANT') {
    return <AccessDenied onLogout={async () => { await logout(); setUser(null); }} />;
  }

  return (
    <AdminShell user={user} path={path} go={go} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
      onLogout={async () => { await logout(); setUser(null); go('/'); }} />
  );
}

function Splash() {
  return <div className="splash"><div className="brand-mark">USD</div><div className="loader" /></div>;
}

function LoginScreen({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try { await onLogin(email, password); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выполнить вход'); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      <div className="login-grid" />
      <div className="login-card">
        <div className="brand-lockup"><div className="brand-mark">USD</div><span>2.0</span></div>
        <div className="eyebrow">Competition Management System</div>
        <h1>С возвращением</h1>
        <p className="muted">Войдите в административную панель USD.</p>
        <form onSubmit={submit} className="form">
          <label>Email<input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="username" required placeholder="you@example.com" /></label>
          <label>Пароль<input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" required placeholder="••••••••" /></label>
          {error && <div className="form-error"><AlertTriangle size={16}/>{error}</div>}
          <button className="primary-button" disabled={loading}>{loading ? 'Входим…' : 'Войти'}<ChevronRight size={18}/></button>
        </form>
        <div className="login-footer"><span>USD Russia</span><span>Secure access</span></div>
      </div>
    </div>
  );
}

function AccessDenied({ onLogout }: { onLogout: () => Promise<void> }) {
  return <div className="center-page"><div className="empty-card"><ShieldAlert size={36}/><h2>Нет доступа к панели</h2><p className="muted">Учётная запись участника не имеет доступа к Admin Panel.</p><button className="secondary-button" onClick={() => void onLogout()}>Выйти</button></div></div>;
}

function AdminShell({ user, path, go, mobileOpen, setMobileOpen, onLogout }: {
  user: User; path: string; go: (path: string) => void; mobileOpen: boolean; setMobileOpen: (v: boolean) => void; onLogout: () => Promise<void>;
}) {
  const visibleNav = useMemo(() => nav.filter(item => item.roles.includes(user.role)), [user.role]);
  const active = visibleNav.find(item => path === item.path || (item.path !== '/admin' && path.startsWith(item.path)));
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-top">
          <button className="brand-button" onClick={() => go('/admin')}><span className="brand-mark small">USD</span><span className="brand-title">USD <b>2.0</b></span></button>
          <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)}><X size={19}/></button>
        </div>
        <div className="sidebar-label">Управление</div>
        <nav>{visibleNav.map(item => {
          const Icon = item.icon;
          return <button key={item.path} className={`nav-item ${active?.path === item.path ? 'active' : ''}`} onClick={() => go(item.path)}><Icon size={18}/><span>{item.label}</span>{active?.path === item.path && <span className="nav-dot"/>}</button>;
        })}</nav>
        <div className="sidebar-bottom">
          <div className="user-mini"><div className="avatar">{(user.name ?? user.email).slice(0,1).toUpperCase()}</div><div><strong>{user.name || 'Пользователь'}</strong><small>{roleName[user.role]}</small></div></div>
          <button className="logout-button" onClick={() => void onLogout()}><LogOut size={17}/>Выйти</button>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="Закрыть меню" />}
      <main className="main">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileOpen(true)}><Menu size={21}/></button>
          <div className="breadcrumb"><span>USD 2.0</span><ChevronRight size={14}/><strong>{active?.label ?? 'Панель'}</strong></div>
          <div className="topbar-actions"><button className="icon-button"><Bell size={19}/></button><div className="role-pill">{user.role === 'JUDGE' ? 'JUDGE MODE' : 'ADMIN MODE'}</div></div>
        </header>
        <div className="content">
          <Page path={path} go={go} user={user} />
        </div>
      </main>
    </div>
  );
}

function Page({ path, go, user }: { path: string; go: (path: string) => void; user: User }) {
  if (path === '/admin' || path === '/admin/') return <DashboardPage go={go} />;
  const item = nav.find(x => x.path === path || (x.path !== '/admin' && path.startsWith(x.path)));
  return <ComingPage item={item?.label ?? 'Раздел'} icon={item?.icon ?? Settings2} user={user} />;
}

function DashboardPage({ go }: { go: (path: string) => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [quality, setQuality] = useState<{ counts: { total: number; error: number; warning: number; info: number }; healthy: boolean } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([getDashboard(), getDataQuality().catch(() => null)])
      .then(([dashboard, dq]) => { setData(dashboard); setQuality(dq); })
      .catch(e => setError(e instanceof Error ? e.message : 'Не удалось загрузить dashboard'));
  }, []);

  if (error) return <div className="page"><PageHeading title="Dashboard" subtitle="Операционный центр USD 2.0"/><div className="error-panel"><AlertTriangle/><div><strong>Не удалось загрузить данные</strong><p>{error}</p></div></div></div>;
  if (!data) return <DashboardSkeleton />;

  const kpis = [
    ['Участники', data.overview.participants, Users, '/admin/participants'],
    ['Автомобили', data.overview.cars, CarFront, '/admin/cars'],
    ['Этапы', data.overview.stages, Flag, '/admin/stages'],
    ['Регистрации', data.overview.registrations, ClipboardCheck, '/admin/registrations'],
    ['Результаты', data.overview.results, Trophy, '/admin/results'],
    ['Рекорды', data.overview.records, Gauge, '/admin/records'],
  ] as const;

  return <div className="page">
    <PageHeading title="Dashboard" subtitle="Операционный центр USD 2.0" right={<div className="live-status"><span/>Система работает</div>} />
    <section className="kpi-grid">{kpis.map(([label,value,Icon,target]) => <button className="kpi-card" key={label} onClick={() => go(target)}><div className="kpi-icon"><Icon size={19}/></div><div><span>{label}</span><strong>{value.toLocaleString('ru-RU')}</strong></div><ChevronRight className="kpi-arrow" size={17}/></button>)}</section>
    <section className="dashboard-grid">
      <div className="panel attention-panel">
        <PanelTitle title="Требует внимания" icon={Bell}/>
        <div className="attention-list">
          <Attention label="Открытые этапы" value={data.attention.openStages} tone="neutral" onClick={() => go('/admin/stages')}/>
          <Attention label="Без инспекции" value={data.attention.pendingInspections} tone={data.attention.pendingInspections ? 'warning' : 'good'} onClick={() => go('/admin/inspections')}/>
          <Attention label="Проваленные инспекции" value={data.attention.failedInspections} tone={data.attention.failedInspections ? 'danger' : 'good'} onClick={() => go('/admin/inspections')}/>
          <Attention label="Результаты сегодня" value={data.attention.resultsToday} tone="good" onClick={() => go('/admin/results')}/>
          <Attention label="Активные дисквалификации" value={data.attention.activeDisqualifications} tone={data.attention.activeDisqualifications ? 'warning' : 'good'} onClick={() => go('/admin/disqualifications')}/>
          <Attention label="Импорты требуют решения" value={data.attention.unresolvedImports} tone={data.attention.unresolvedImports ? 'danger' : 'good'} onClick={() => go('/admin/import')}/>
        </div>
      </div>
      <div className="panel quality-panel">
        <PanelTitle title="Контроль данных" icon={Database}/>
        {quality ? <><div className={`quality-ring ${quality.healthy ? 'healthy' : 'bad'}`}><strong>{quality.counts.error + quality.counts.warning}</strong><span>проблем</span></div><div className="quality-stats"><div><b>{quality.counts.error}</b><span>Ошибки</span></div><div><b>{quality.counts.warning}</b><span>Предупреждения</span></div><div><b>{quality.counts.info}</b><span>Информация</span></div></div><button className="text-button" onClick={() => go('/admin/data-quality')}>Открыть контроль данных <ChevronRight size={15}/></button></> : <p className="muted">Контроль данных недоступен для текущей роли.</p>}
      </div>
    </section>
    <section className="dashboard-grid lower">
      <div className="panel">
        <PanelTitle title="Ближайшие этапы" icon={CalendarDays} action="Все этапы" onAction={() => go('/admin/stages')}/>
        <div className="stage-list">{data.upcomingStages.length ? data.upcomingStages.map(stage => <button className="stage-row" key={stage.id} onClick={() => go('/admin/stages')}><div className="stage-number">{stage.stageNumber}</div><div className="stage-main"><strong>{stage.name}</strong><span>{stage.city} · {formatDate(stage.date)}</span></div><span className={`status ${stage.registrationOpen ? 'open' : ''}`}>{stage.registrationOpen ? 'Регистрация открыта' : 'Закрыта'}</span><ChevronRight size={16}/></button>) : <Empty text="Ближайших этапов нет"/>}</div>
      </div>
      <div className="panel">
        <PanelTitle title="Последние этапы" icon={History} action="Все этапы" onAction={() => go('/admin/stages')}/>
        <div className="stage-list">{data.recentStages.length ? data.recentStages.map(stage => <button className="stage-row" key={stage.id} onClick={() => go('/admin/stages')}><div className="stage-number muted-number">{stage.stageNumber}</div><div className="stage-main"><strong>{stage.name}</strong><span>{stage.city} · {formatDate(stage.date)}</span></div><ChevronRight size={16}/></button>) : <Empty text="Истории этапов пока нет"/>}</div>
      </div>
    </section>
  </div>;
}

function Attention({ label, value, tone, onClick }: { label: string; value: number; tone: string; onClick: () => void }) {
  return <button className="attention-row" onClick={onClick}><span className={`attention-dot ${tone}`}/><span>{label}</span><b>{value}</b><ChevronRight size={15}/></button>;
}
function PanelTitle({ title, icon: Icon, action, onAction }: { title: string; icon: typeof Bell; action?: string; onAction?: () => void }) {
  return <div className="panel-title"><div><Icon size={17}/><h2>{title}</h2></div>{action && <button className="text-button" onClick={onAction}>{action}<ChevronRight size={14}/></button>}</div>;
}
function PageHeading({ title, subtitle, right }: { title: string; subtitle: string; right?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">USD 2.0</div><h1>{title}</h1><p>{subtitle}</p></div>{right}</div>;
}
function Empty({ text }: { text: string }) { return <div className="empty-state"><Activity size={20}/><span>{text}</span></div>; }
function ComingPage({ item, icon: Icon, user }: { item: string; icon: typeof Settings2; user: User }) {
  return <div className="page"><PageHeading title={item} subtitle={user.role === 'JUDGE' ? 'Раздел доступен в режиме судьи' : 'Управление разделом USD 2.0'} /><div className="panel feature-placeholder"><div className="placeholder-icon"><Icon size={28}/></div><h2>Раздел готовится</h2><p>Каркас Admin Panel уже подключён. Здесь будет полноценный интерфейс раздела с таблицами, фильтрами, действиями и правами роли.</p><div className="placeholder-tags"><span>RBAC</span><span>API ready</span><span>Responsive</span></div></div></div>;
}
function DashboardSkeleton() {
  return <div className="page"><PageHeading title="Dashboard" subtitle="Загрузка операционного центра…"/><div className="kpi-grid">{Array.from({length:6},(_,i)=><div className="skeleton-card" key={i}/>)}</div><div className="dashboard-grid"><div className="panel skeleton-panel"/><div className="panel skeleton-panel"/></div></div>;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export default App;
