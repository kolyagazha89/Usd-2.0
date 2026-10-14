import {Info} from 'lucide-react';
import type {Role,User} from '../api';
import RolesPage from './RolesPage';
import HistoricalPage from './HistoricalPage';
import ImportPage from './ImportPage';
import CarsPage, {CarEditorPage} from './CarsPage';
import DisqualificationsPage from './DisqualificationsPage';
import RecordsPage from './RecordsPage';
import UsersPage from './UsersPage';
import StatisticsPage from './StatisticsPage';
import QualityPage from './QualityPage';
import TeamsPage from './TeamsPage';
import PartnersPage from './PartnersPage';
import NewsPage from './NewsPage';
import MediaLibraryPage from './MediaLibraryPage';
import SiteSettingsPage from './SiteSettingsPage';
import AssistantPage from './AssistantPage';
import {ClassesPage,SeasonsPage,StageDetailPage,StagesPage} from './CompetitionPages';
import RegistrationsPage from './RegistrationsPage';
import InspectionsPage from './InspectionsPage';
import ResultsPage from './ResultsPage';
import AuditPage from './AuditPage';
import CatalogPage from './CatalogPage';
import ParticipantsPage from './ParticipantsPage';
import ConfigurationsPage from './ConfigurationsPage';
import DashboardPage from './DashboardPage';
import RulesAdminPage from '../RulesAdminPage';

export function AdminRoutes({path,go,user,PageFrame,ErrorPanel,LoadingPage,Empty,PanelTitle,ResourcePage,EntityDetailModal,EntityForm,SearchableSelect,enumLabel,formatDate,displayCarName,displayPersonName,roleName,humanize,humanizeAuditKey,clean,isValidPlate,PublicResultCards,cacheBrandLogo}:{path:string;go:(p:string)=>void;user:User;PageFrame:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>;PanelTitle:React.ComponentType<any>;ResourcePage:React.ComponentType<any>;EntityDetailModal:React.ComponentType<any>;EntityForm:React.ComponentType<any>;SearchableSelect:React.ComponentType<any>;enumLabel:(v:any)=>string;formatDate:(v:string)=>string;displayCarName:(car:any,fallback?:string)=>string;displayPersonName:(v:any)=>string;roleName:Record<Role,string>;humanize:(v:string)=>string;humanizeAuditKey:(v:string)=>string;clean:(v:any)=>any;isValidPlate:(country:string,value:string)=>boolean;PublicResultCards:React.ComponentType<any>;cacheBrandLogo:(url:string)=>void}){
  if(path==='/admin'||path==='/admin/')return <DashboardPage go={go} PageFrame={PageFrame} PanelTitle={PanelTitle} Empty={Empty} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} formatDate={formatDate} enumLabel={enumLabel} displayCarName={displayCarName}/>;
  if(path.startsWith('/admin/roles'))return <RolesPage PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} Empty={Empty}/>;
  if(path.startsWith('/admin/participants'))return <ParticipantsPage ResourcePage={ResourcePage} displayCarName={displayCarName}/>;
  if(path.startsWith('/admin/teams'))return <TeamsPage PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} Empty={Empty}/>;
  if(path.startsWith('/admin/cars/new'))return <CarEditorPage user={user} carId="" go={go} PageFrame={PageFrame} LoadingPage={LoadingPage} ErrorPanel={ErrorPanel} isValidPlate={isValidPlate} clean={clean}/>;
  if(path.startsWith('/admin/cars/edit')){const carId=(()=>{try{return new URLSearchParams(path.split('?')[1]??'').get('carId')??''}catch{return''}})();if(!carId)return <PageFrame title="Редактировать автомобиль" subtitle="Карточка автомобиля участника"><ErrorPanel message="Не указан идентификатор автомобиля"/></PageFrame>;return <CarEditorPage user={user} carId={carId} go={go} PageFrame={PageFrame} LoadingPage={LoadingPage} ErrorPanel={ErrorPanel} isValidPlate={isValidPlate} clean={clean}/>;}
  if(path.startsWith('/admin/cars/configurations')){const carId=(()=>{try{return new URLSearchParams(path.split('?')[1]??'').get('carId')??''}catch{return''}})();return <ConfigurationsPage carId={carId} go={go} admin LoadingPage={LoadingPage} displayCarName={displayCarName}/>;}
  if(path.startsWith('/admin/cars'))return <CarsPage user={user} go={go} PageFrame={PageFrame} Empty={Empty} LoadingPage={LoadingPage} EntityDetailModal={EntityDetailModal} displayCarName={displayCarName}/>;
  if(path.startsWith('/admin/seasons'))return <SeasonsPage ResourcePage={ResourcePage}/>;
  if(path.startsWith('/admin/stages/')&&!path.startsWith('/admin/stages/new')&&!path.startsWith('/admin/stages/edit'))return <StageDetailPage stageId={path.split('/')[3]} go={go} PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} PanelTitle={PanelTitle} Empty={Empty} enumLabel={enumLabel} formatDate={formatDate} PublicResultCards={PublicResultCards}/>;
  if(path.startsWith('/admin/stages'))return <StagesPage go={go} user={user} ResourcePage={ResourcePage} LoadingPage={LoadingPage} PanelTitle={PanelTitle} Empty={Empty} PageFrame={PageFrame} ErrorPanel={ErrorPanel} enumLabel={enumLabel} formatDate={formatDate}/>;
  if(path.startsWith('/admin/classes'))return <ClassesPage PageFrame={PageFrame} ResourcePage={ResourcePage}/>;
  if(path.startsWith('/admin/registrations'))return <RegistrationsPage PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} Empty={Empty} EntityDetailModal={EntityDetailModal} displayCarName={displayCarName} formatDate={formatDate} enumLabel={enumLabel}/>;
  if(path.startsWith('/admin/inspections'))return <InspectionsPage key={path} user={user} go={go} PageFrame={PageFrame} Empty={Empty} LoadingPage={LoadingPage} SearchableSelect={SearchableSelect} displayCarName={displayCarName} enumLabel={enumLabel}/>;
  if(path.startsWith('/admin/results'))return <ResultsPage user={user} PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} Empty={Empty} EntityDetailModal={EntityDetailModal} enumLabel={enumLabel} displayCarName={displayCarName} displayPersonName={displayPersonName}/>;
  if(path.startsWith('/admin/disqualifications'))return <DisqualificationsPage PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} Empty={Empty} displayPersonName={displayPersonName} roleName={roleName} enumLabel={enumLabel}/>;
  if(path.startsWith('/admin/historical-results'))return <HistoricalPage PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} Empty={Empty} PanelTitle={PanelTitle} EntityDetailModal={EntityDetailModal} enumLabel={enumLabel} formatDate={formatDate}/>;
  if(path.startsWith('/admin/import'))return <ImportPage PageFrame={PageFrame} PanelTitle={PanelTitle} Empty={Empty} enumLabel={enumLabel}/>;
  if(path.startsWith('/admin/records'))return <RecordsPage user={user} PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} Empty={Empty} EntityDetailModal={EntityDetailModal} displayCarName={displayCarName} formatDate={formatDate}/>;
  if(path.startsWith('/admin/statistics'))return <StatisticsPage PageFrame={PageFrame} PanelTitle={PanelTitle} LoadingPage={LoadingPage} Empty={Empty} ErrorPanel={ErrorPanel}/>;
  if(path.startsWith('/admin/users'))return <UsersPage PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} EntityForm={EntityForm} EntityDetailModal={EntityDetailModal} formatDate={formatDate}/>;
  if(path.startsWith('/admin/media'))return <MediaLibraryPage user={user} PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} Empty={Empty}/>;
  if(path.startsWith('/admin/audit'))return <AuditPage PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} Empty={Empty} enumLabel={enumLabel} formatDate={formatDate} roleName={roleName}/>;
  if(path.startsWith('/admin/data-quality'))return <QualityPage PageFrame={PageFrame} Empty={Empty} ErrorPanel={ErrorPanel} enumLabel={enumLabel} humanize={humanize} humanizeAuditKey={humanizeAuditKey}/>;
  if(path.startsWith('/admin/partners'))return <PartnersPage PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} Empty={Empty}/>;
  if(path.startsWith('/admin/news'))return <NewsPage PageFrame={PageFrame} PanelTitle={PanelTitle} LoadingPage={LoadingPage} Empty={Empty} formatDate={formatDate}/>;
  if(path.startsWith('/admin/vibration'))return <CatalogPage mode="vibration" PageFrame={PageFrame} PanelTitle={PanelTitle} LoadingPage={LoadingPage} Empty={Empty}/>;
  if(path.startsWith('/admin/components'))return <CatalogPage mode="components" PageFrame={PageFrame} PanelTitle={PanelTitle} LoadingPage={LoadingPage} Empty={Empty}/>;
  if(path.startsWith('/admin/site-settings'))return <SiteSettingsPage PageFrame={PageFrame} PanelTitle={PanelTitle} LoadingPage={LoadingPage} ErrorPanel={ErrorPanel} cacheBrandLogo={cacheBrandLogo} humanize={humanize}/>;
  if(path.startsWith('/admin/rules'))return <RulesAdminPage/>;
  if(path.startsWith('/admin/assistant'))return <AssistantPage go={go} PageFrame={PageFrame} enumLabel={enumLabel}/>;
  return <Coming title="Страница не найдена" icon={Info} user={user} PageFrame={PageFrame}/>;
 }

function Coming({title,icon:Icon,user,PageFrame}:{title:string;icon:any;user:User;PageFrame:React.ComponentType<any>}){return <PageFrame title={title} subtitle={user.role==='JUDGE'?'Раздел доступен в режиме судьи':'Управление разделом USD'}><div className="panel feature-placeholder"><div className="placeholder-icon"><Icon size={28}/></div><h2>Раздел готовится</h2><p>Каркас подключён. Интерфейс будет расширяться поверх реального API без изменения серверных прав.</p></div></PageFrame>}

export default AdminRoutes;
