import {AlertTriangle,Bell,BarChart3,CalendarDays,CarFront,ClipboardCheck,Database,FileClock,FileInput,Flag,Gauge,History,LayoutDashboard,Layers,LockKeyhole,Package,Settings2,ShieldAlert,Trophy,UserRound,Users,Bot} from 'lucide-react';
import type { Role } from '../api';

export const adminNavigation = [
 {section:'Рабочий стол',label:'Панель управления',path:'/admin',icon:LayoutDashboard,roles:['ADMIN','JUDGE']},

 // Оперативная работа на этапах
 {section:'Соревнования',label:'Этапы',path:'/admin/stages',icon:Flag,roles:['ADMIN','JUDGE']},
 {section:'Соревнования',label:'Регистрации',path:'/admin/registrations',icon:ClipboardCheck,roles:['ADMIN','JUDGE']},
 {section:'Соревнования',label:'Инспекции',path:'/admin/inspections',icon:ShieldAlert,roles:['ADMIN','JUDGE']},
 {section:'Соревнования',label:'Результаты',path:'/admin/results',icon:Trophy,roles:['ADMIN','JUDGE']},

 // Люди, команды и автомобили
 {section:'Участники и автопарк',label:'Участники',path:'/admin/participants',icon:Users,roles:['ADMIN']},
 {section:'Участники и автопарк',label:'Команды',path:'/admin/teams',icon:Users,roles:['ADMIN']},
 {section:'Участники и автопарк',label:'Автомобили',path:'/admin/cars',icon:CarFront,roles:['ADMIN']},

 // Итоги, рекорды и спортивный контроль
 {section:'Результаты и контроль',label:'Рекорды',path:'/admin/records',icon:Trophy,roles:['ADMIN','JUDGE']},
 {section:'Результаты и контроль',label:'Статистика',path:'/admin/statistics',icon:BarChart3,roles:['ADMIN','JUDGE']},
 {section:'Результаты и контроль',label:'Дисквалификации',path:'/admin/disqualifications',icon:AlertTriangle,roles:['ADMIN']},

 // Публичные материалы сайта
 {section:'Контент сайта',label:'Новости',path:'/admin/news',icon:Bell,roles:['ADMIN']},
 {section:'Контент сайта',label:'Партнёры',path:'/admin/partners',icon:Users,roles:['ADMIN']},
 {section:'Контент сайта',label:'Регламент и правила',path:'/admin/rules',icon:FileClock,roles:['ADMIN']},

 // Справочники, используемые в регистрации и каталоге
 {section:'Справочники',label:'Сезоны',path:'/admin/seasons',icon:CalendarDays,roles:['ADMIN']},
 {section:'Справочники',label:'Классы',path:'/admin/classes',icon:Gauge,roles:['ADMIN']},
 {section:'Справочники',label:'Виброизоляция',path:'/admin/vibration',icon:Layers,roles:['ADMIN']},
 {section:'Справочники',label:'Комплектующие',path:'/admin/components',icon:Package,roles:['ADMIN']},

 // Импорт, история и качество данных
 {section:'Импорт и данные',label:'Импорт',path:'/admin/import',icon:FileInput,roles:['ADMIN']},
 {section:'Импорт и данные',label:'История результатов',path:'/admin/historical-results',icon:History,roles:['ADMIN']},
 {section:'Импорт и данные',label:'Контроль данных',path:'/admin/data-quality',icon:Database,roles:['ADMIN']},

 // Доступы, настройки и системные инструменты
 {section:'Система',label:'Пользователи и доступы',path:'/admin/users',icon:UserRound,roles:['ADMIN']},
 {section:'Система',label:'Медиатека',path:'/admin/media',icon:Layers,roles:['ADMIN']},
 {section:'Система',label:'Роли и права',path:'/admin/roles',icon:LockKeyhole,roles:['ADMIN']},
 {section:'Система',label:'Аудит действий',path:'/admin/audit',icon:FileClock,roles:['ADMIN']},
 {section:'Система',label:'Настройки сайта',path:'/admin/site-settings',icon:Settings2,roles:['ADMIN']},
 {section:'Система',label:'Ассистент USD',path:'/admin/assistant',icon:Bot,roles:['ADMIN']},
 ];

export function navPermissionModule(path:string):string {
 if(path==='/admin')return 'statistics';
 if(path.startsWith('/admin/stages'))return 'stages';
 if(path.startsWith('/admin/registrations'))return 'registrations';
 if(path.startsWith('/admin/inspections'))return 'inspections';
 if(path.startsWith('/admin/results'))return 'results';
 if(path.startsWith('/admin/records'))return 'records';
 if(path.startsWith('/admin/participants'))return 'participants';
 if(path.startsWith('/admin/teams'))return 'teams';
 if(path.startsWith('/admin/cars'))return 'cars';
 if(path.startsWith('/admin/seasons'))return 'seasons';
 if(path.startsWith('/admin/classes'))return 'classes';
 if(path.startsWith('/admin/disqualifications'))return 'disqualifications';
 if(path.startsWith('/admin/statistics'))return 'statistics';
 if(path.startsWith('/admin/import'))return 'imports';
 if(path.startsWith('/admin/historical-results'))return 'historicalResults';
 if(path.startsWith('/admin/data-quality')||path.startsWith('/admin/audit'))return 'statistics';
 if(path.startsWith('/admin/media'))return 'media';
 if(path.startsWith('/admin/assistant'))return 'assistant';
 if(path.startsWith('/admin/google'))return 'integrations';
 if(path.startsWith('/admin/site-settings')||path.startsWith('/admin/partners')||path.startsWith('/admin/news')||path.startsWith('/admin/rules')||path.startsWith('/admin/vibration')||path.startsWith('/admin/components'))return 'siteSettings';
 return '';
}

export const roleName:Record<Role,string>={ADMIN:'Администратор',JUDGE:'Судья',PARTICIPANT:'Участник'};
