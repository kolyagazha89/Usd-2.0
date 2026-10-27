export type Variant = 'velocity' | 'obsidian' | 'sonic';
export const official = 'https://app.usd-russia.ru';
export const nextStageId = 'f551ebf5-42db-446b-acdf-a644252ebded';
export const registrationUrl = `${official}/login?next=${encodeURIComponent('/participant/register?stageId=' + nextStageId)}`;
export const assets = {
  logo: '/assets/usd-original.png', car: '/assets/higgsfield-car.webp',
  speaker: '/assets/higgsfield-speaker.webp', arena: '/assets/usd-arena.webp',
};

// Public observations from 27 October 2026. These are design fixtures, never API state.
export const events = [
  { id: nextStageId, name: 'USD Winter Cup', city: 'Краснодар', date: '21', month: 'ноября', year: '2026', number: '11', state: 'upcoming', label: 'Регистрация открыта', image: assets.car, href: `${official}/stages/${nextStageId}` },
  { id: 'volgograd', name: 'Финал чемпионата', city: 'Волгоград', date: '12', month: 'сентября', year: '2026', number: '10', state: 'archive', label: 'Этап завершён', image: assets.arena, href: `${official}/stages?season=2026` },
  { id: 'samara', name: 'Громче. Выше. Дальше.', city: 'Самара', date: '15', month: 'августа', year: '2026', number: '09', state: 'archive', label: 'Этап завершён', image: assets.speaker, href: `${official}/stages?season=2026` },
];

export const winners = [
  { id:'delta', name:'Дельта Андрей', value:174.5, unit:'дБ', direction:'SPL', className:'Mad-X', team:'Aura Sound Equipment', profile:'3fce59b4-a4bd-42fd-8e59-8e263385887e' },
  { id:'haylo', name:'Хайло Павел', value:170, unit:'дБ', direction:'SPL', className:'Wall+', team:'Чемпионат USD', profile:'903f909f-0008-49d5-ae3e-8980af115a6c' },
  { id:'telpov', name:'Телпов Анатолий', value:167.1, unit:'дБ', direction:'SPL', className:'Wall', team:'Чемпионат USD', profile:'3281f52d-a430-41d0-a953-cf05b673c132' },
  { id:'bfspl1', name:'Участник BFSPL', value:138.34, unit:'дБ', direction:'BFSPL', className:'Wicket 10+', team:'Пример карточки', profile:null },
  { id:'bfspl2', name:'Участник BFSPL', value:135.8, unit:'дБ', direction:'BFSPL', className:'Wicket 6–10', team:'Пример карточки', profile:null },
  { id:'bdw', name:'Участник BDW SPL', value:154.6, unit:'дБ', direction:'BDW SPL', className:'BDW', team:'Пример карточки', profile:null },
];
export const records = [
  { direction:'SPL', className:'Mad-X', value:174.5, unit:'дБ', name:'Дельта Андрей', detail:'Звуковое давление. Результат, который говорит сам за себя.', label:'Абсолютный рекорд SPL' },
  { direction:'BFSPL', className:'Wicket 10+', value:138.34, unit:'дБ', name:'Чемпионат USD', detail:'Фронтальная система. Точность, мощность и ни одной случайной детали.', label:'Рекорд направления BFSPL' },
  { direction:'Storm Wall', className:'Storm Wall', value:512.5, unit:'м/с', name:'Назаров Иван', detail:'Скорость воздушного потока. Другое измерение энергии звука.', label:'Рекорд Storm Wall' },
];
export const stories = [
  { number:'01', category:'Чемпионат', title:'Там, где звук становится событием.', description:'Люди, автомобили и эмоции соревнований USD.', image:assets.arena, alt:'Арена соревнований по автозвуку USD' },
  { number:'02', category:'Технологии', title:'За каждым децибелом — инженерия.', description:'Почему конфигурация решает всё.', image:assets.speaker, alt:'Детали конструкции сабвуфера' },
  { number:'03', category:'Сообщество', title:'Одна страсть. Сотни историй.', description:'Машины, в которые вложено гораздо больше, чем оборудование.', image:assets.car, alt:'Автомобиль с системой сабвуферов' },
];
export function formatValue(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits:2 }).format(value);
}

