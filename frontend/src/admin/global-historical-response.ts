export type HistoricalStage = { name: string; year: number; number: number; status: string; sourceRows: number; imported: number; aliases: number; kept: number; jobId?: string; error?: string; review: Array<{ sheet: string; row: number; name: string; reason: string }> };
export type HistoricalConsolidation = { groupsMerged: number; profilesMerged: number; namesCorrected: number; skipped: Array<{ label: string; reason: string }> };
export type HistoricalBatch = { id: string; status: string; sourceResults: number; imported: number; kept: number; aliases: number; needsReview: number; failedStages: number; processedStages: number; totalStages: number; peopleInSource: number; stages: HistoricalStage[]; consolidation: HistoricalConsolidation | null };

/** Nest can serialize a null return value as an empty HTTP body. The API
 * client parses that as {}, which must never become a renderable batch. */
export function parseHistoricalBatch(value: unknown): HistoricalBatch | null {
 if(value==null)return null;
 if(typeof value!=='object'||Array.isArray(value))throw new Error('Не удалось прочитать состояние импорта. Обновите страницу.');
 const data=value as Record<string,unknown>;
 if(Object.keys(data).length===0)return null;
 if(typeof data.id!=='string'||!data.id||typeof data.status!=='string'||!Array.isArray(data.stages))throw new Error('Сервер вернул неполное состояние импорта. Повторите загрузку.');
 const count=(item:Record<string,unknown>,key:string)=>{const n=item[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0)throw new Error('Сервер вернул некорректные счётчики импорта. Повторите загрузку.');return n};
 const text=(item:Record<string,unknown>,key:string)=>{const s=item[key];if(typeof s!=='string')throw new Error('Сервер вернул неполные данные этапа. Повторите загрузку.');return s};
 const stages=data.stages.map((raw:unknown)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Сервер вернул некорректный этап импорта.');
  const item=raw as Record<string,unknown>;
  const review=item.review??[];if(!Array.isArray(review))throw new Error('Сервер вернул некорректный список проверки.');
  return {name:text(item,'name'),year:count(item,'year'),number:count(item,'number'),status:text(item,'status'),sourceRows:count(item,'sourceRows'),imported:count(item,'imported'),aliases:count(item,'aliases'),kept:count(item,'kept'),
   jobId:typeof item.jobId==='string'?item.jobId:undefined,error:typeof item.error==='string'?item.error:undefined,
   review:review.map(raw=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Сервер вернул некорректную строку проверки.');const row=raw as Record<string,unknown>;return {sheet:text(row,'sheet'),row:count(row,'row'),name:text(row,'name'),reason:text(row,'reason')}})};
 });
 const rawConsolidation = data.consolidation;
 let consolidation: HistoricalConsolidation | null = null;
 if(rawConsolidation && typeof rawConsolidation === 'object' && !Array.isArray(rawConsolidation)){
  const summary = rawConsolidation as Record<string,unknown>;
  const skipped = Array.isArray(summary.skipped) ? summary.skipped : [];
  consolidation = {
   groupsMerged: count(summary,'groupsMerged'),profilesMerged: count(summary,'profilesMerged'),
   namesCorrected: typeof summary.namesCorrected === 'number' ? count(summary,'namesCorrected') : 0,
   skipped: skipped.filter((x): x is {label:string;reason:string} => Boolean(x && typeof x === 'object' &&
     typeof (x as {label?:unknown}).label === 'string' && typeof (x as {reason?:unknown}).reason === 'string')),
  };
 }
 return {id:data.id,status:data.status,stages,sourceResults:count(data,'sourceResults'),imported:count(data,'imported'),kept:count(data,'kept'),aliases:count(data,'aliases'),needsReview:count(data,'needsReview'),failedStages:count(data,'failedStages'),processedStages:count(data,'processedStages'),totalStages:count(data,'totalStages'),peopleInSource:count(data,'peopleInSource'),consolidation};
}
