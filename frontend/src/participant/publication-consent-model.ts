export const PUBLICATION_OPTIONS = [
 {key:'identity',label:'ФИО и публичный USD ID'},
 {key:'city',label:'Город или населённый пункт'},
 {key:'team',label:'Команда и история принадлежности'},
 {key:'results',label:'Классы, этапы, места, результаты и рекорды'},
 {key:'car',label:'Марка, модель и описание автомобиля'},
 {key:'profilePhoto',label:'Фотография профиля'},
 {key:'carPhoto',label:'Фотография автомобиля'},
 {key:'eventPhoto',label:'Изображение на фото и видео с соревнований'},
 {key:'promotionPhoto',label:'Использование изображения в рекламных материалах USD'},
] as const;

export type PublicationChoiceKey = (typeof PUBLICATION_OPTIONS)[number]['key'];
export type PublicationChoices = Record<PublicationChoiceKey,boolean>;

export const emptyChoices = (): PublicationChoices => ({
 identity:false,city:false,team:false,results:false,car:false,
 profilePhoto:false,carPhoto:false,eventPhoto:false,promotionPhoto:false,
});
export function coerceChoices(raw:unknown):PublicationChoices {
 const data=(raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{} ) as Record<string,unknown>;
 const result=emptyChoices();
 for(const option of PUBLICATION_OPTIONS)result[option.key]=data[option.key]===true;
 return result;
}
