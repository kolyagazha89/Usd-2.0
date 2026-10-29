/**
 * Box dimensions live in the versioned description until a dedicated schema
 * migration is available. Keep old text readable and never silently discard it.
 */
export type BoxParameters={type:string;volume:string;tuning:string};

// Older notes may precede the structured box line. Match only whole lines so
// a casual mention of "Короб:" in a sentence is never mistaken for metadata.
const BOX_LINE=/^Короб: ([^\r\n·]+) · (\d+(?:[.,]\d+)?) л · (\d+(?:[.,]\d+)?) Гц(?:\r?\n){0,2}/gm;

export function boxFromDescription(description:string):BoxParameters{
 const match=description.matchAll(BOX_LINE).next().value;
 return {type:match?.[1]?.trim()||'ФИ',volume:match?.[2]?.replace(',','.')||'',tuning:match?.[3]?.replace(',','.')||''};
}

export function withoutBoxLine(description:string):string{
 // A former editor could append another box line after free-form notes. Strip
 // all recognized structured lines before writing the next version, without
 // dropping the participant's own text.
 return description.replace(BOX_LINE,'');
}

function parsedValue(value:string,max:number):number|null{
 const raw=value.trim();
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw))return null;
 const numeric=Number(raw.replace(',','.'));
 return Number.isFinite(numeric)&&numeric>=1&&numeric<=max?numeric:null;
}

/** A missing box is optional, but a partially filled or invalid box is not. */
export function validateBoxParameters(box:BoxParameters):string|null{
 if(!box.volume.trim()&&!box.tuning.trim())return null;
 if(!box.type.trim()||/[\r\n·]/.test(box.type))return 'Выберите корректный тип короба.';
 if(parsedValue(box.volume,10000)===null||parsedValue(box.tuning,200)===null){
  return 'Укажите объём короба от 1 до 10 000 л и настройку от 1 до 200 Гц (до двух знаков после запятой).';
 }
 return null;
}

export function isBoxConfigured(box:BoxParameters):boolean{
 return Boolean(box.volume.trim()&&box.tuning.trim())&&!validateBoxParameters(box);
}

export function formatBoxLine(box:BoxParameters):string{
 if(!isBoxConfigured(box))return '';
 return 'Короб: '+box.type.trim()+' · '+parsedValue(box.volume,10000)+' л · '+parsedValue(box.tuning,200)+' Гц\n\n';
}
