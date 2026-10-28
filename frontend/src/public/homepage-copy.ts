/** Public homepage copy: each label can be edited in CMS, these are fallback values only. */
export const HOMEPAGE_COPY_FIELDS=[
 {key:'nextStageEyebrow',label:'Ближайший этап — подпись',fallback:'БЛИЖАЙШИЙ ЭТАП'},
 {key:'nextStageDetailsButton',label:'Ближайший этап — кнопка подробностей',fallback:'Подробнее об этапе'},
 {key:'nextStageRegistrationButton',label:'Ближайший этап — кнопка регистрации',fallback:'Регистрация на этап'},
 {key:'nextStageEmptyEyebrow',label:'Нет этапов — подпись',fallback:'СЛЕДУЮЩИЙ СТАРТ'},
 {key:'nextStageEmptyTitle',label:'Нет этапов — заголовок',fallback:'Скоро громче.'},
 {key:'nextStageEmptyDescription',label:'Нет этапов — описание',fallback:'Новые даты появятся после публикации календаря.'},
 {key:'nextStageAllButton',label:'Нет этапов — кнопка',fallback:'Все этапы чемпионата'},
 {key:'latestResultsAllButton',label:'Последние результаты — кнопка',fallback:'Все результаты ↗'},
 {key:'latestResultsEmptyTitle',label:'Нет результатов — заголовок',fallback:'Результаты впереди'},
 {key:'latestResultsEmptyDescription',label:'Нет результатов — описание',fallback:'Опубликованные измерения появятся после завершения этапа.'},
 {key:'recordsAllButton',label:'Рекорды — кнопка',fallback:'Все рекорды ↗'},
 {key:'recordsEmptyTitle',label:'Нет рекордов — заголовок',fallback:'Новые пределы впереди'},
 {key:'recordsEmptyDescription',label:'Нет рекордов — описание',fallback:'Здесь будут подтверждённые рекорды чемпионата.'},
 {key:'teamsAllButton',label:'Команды — кнопка',fallback:'Все команды ↗'},
 {key:'broadcastEyebrow',label:'Медиацентр — подпись',fallback:'ЧЕМПИОНАТ USD / ПРЯМОЙ ЭФИР'},
 {key:'broadcastDescription',label:'Медиацентр — описание',fallback:'Трансляция этапа, результаты измерений и всё, что происходит на площадке.'},
 {key:'liveEmptyTitle',label:'LIVE — заголовок ожидания',fallback:'Измерения ещё не начались'},
 {key:'liveEmptyDescription',label:'LIVE — описание ожидания',fallback:'Результаты участников появятся здесь после публикации на этапе.'},
 {key:'newsAllButton',label:'Новости — кнопка',fallback:'Все новости ↗'},
 {key:'newsEmptyTitle',label:'Нет новостей — заголовок',fallback:'Следи за звуком'},
 {key:'newsEmptyDescription',label:'Нет новостей — описание',fallback:'Анонсы этапов, истории участников и новости чемпионата появятся здесь.'},
 {key:'partnersAllButton',label:'Партнёры — кнопка',fallback:'Все партнёры ↗'},
 {key:'participantsAllButton',label:'Участники — кнопка',fallback:'Все участники ↗'},
 {key:'documentsEyebrow',label:'Документы — подпись',fallback:'ОФИЦИАЛЬНЫЕ ДОКУМЕНТЫ'},
] as const;
export type HomepageCopyKey=typeof HOMEPAGE_COPY_FIELDS[number]['key'];
export function homepageCopy(homepage:unknown,key:HomepageCopyKey):string{
 const row=homepage&&typeof homepage==='object'?homepage as {copy?:Record<string,unknown>}:null;
 const value=row?.copy?.[key];
 return typeof value==='string'?value:HOMEPAGE_COPY_FIELDS.find(field=>field.key===key)?.fallback??'';
}
