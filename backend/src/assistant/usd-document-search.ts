import {USD_PROJECT_DOCUMENTS} from './usd-documents.snapshot';

function clean(value:string):string {
 return value.toLowerCase().replace(/ё/g,'е');
}
const STOPWORDS=new Set(['что','как','для','это','или','где','когда','какие','какой','какая','нужно','можно','если','уже','сейчас','будет','есть','про','эта','этот','все','usd','юсд']);
function words(query:string):string[]{
 return [...new Set((clean(query).match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(x=>!STOPWORDS.has(x)))].slice(0,8);
}
export function searchUsdDocuments(query:string,document:string='all'){
 const terms=words(query);
 if(terms.length===0)return {matches:[],note:'Уточни вопрос: например, офлайн-возврат, регистрация, результаты или безопасность.'};
 const sections:Array<{path:string;title:string;content:string;score:number}>=[];
 for(const doc of USD_PROJECT_DOCUMENTS){
  if(document!=='all' && document!==doc.id)continue;
  for(const section of doc.text.split(/(?=^#{2,4}\s+)/m)){
   const heading=section.split('\n',1)[0].slice(0,200);
   const hay=clean(section);
   const headingLower=clean(heading);
   const score=terms.reduce((sum,term)=>sum+(headingLower.includes(term)?8:0)+(hay.includes(term)?2:0),0);
   if(score<=0)continue;
   // Show relevant part of each section, not just its intro.
   const locations=terms.map(term=>hay.indexOf(term)).filter(index=>index>=0);
   const index=Math.min(...locations);
   const start=Math.max(0,index-260);
   const excerpt=(start>0?'…':'')+section.slice(start,start+2300)+(section.length>start+2300?'…':'');
   sections.push({path:doc.path,title:heading,content:excerpt,score});
  }
 }
 const matches=sections.sort((a,b)=>b.score-a.score).slice(0,4).map(({path,title,content})=>({
  path,title,
  // Public codebase documents still deserve outbound data minimization.
  excerpt:content
   .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email скрыт]')
   .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[IP скрыт]'),
 }));
 return {matches,referenceDate:'2026-11-23',note:'Это выдержки из проектной документации, не подтверждение выпуска функциональности. Актуальные факты проверки — в БД и CI.'};
}
