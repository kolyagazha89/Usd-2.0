export type RulesBlock = {type?:string;text?:string;level?:number;runs?:{text:string;bold?:boolean}[];rows?:string[][]};
/** DOCX sometimes exports titles as bold paragraphs. Do not turn numbered
 * clauses, measurement data or emphasized warnings into navigation headings. */
export function rulesHeadingLevel(block:RulesBlock):number|null {
 if(block.type==='heading')return Math.min(4,Math.max(2,Number(block.level)||2));
 if(block.type!=='paragraph')return null;
 const text=String(block.text??'').trim();
 if(!text||text.length>140||/^[*•!–—-]|!|\d+[.,]\d+\s*(?:dB|дБ|Гц|Вт)/i.test(text))return null;
 if(/^(?:раздел|глава|приложение|часть)\s+\S/i.test(text))return 2;
 const runs=block.runs?.filter(r=>r.text.trim());
 if(!runs?.length||!runs.every(r=>r.bold))return null;
 if(/^\d+(?:\.\d+)*[.)]\s+\p{L}/u.test(text))return 2;
 if(text.length>80||text.split(/\s+/).length>8||/[,;]/.test(text))return null;
 return 3;
}
export function rulesOutline(blocks:RulesBlock[]){
 return blocks.flatMap((block,index)=>{
  const level=rulesHeadingLevel(block);
  return level===null?[]:[{id:'rules-doc-heading-'+index,title:String(block.text??''),index,level}];
 });
}
