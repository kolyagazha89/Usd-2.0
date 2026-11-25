import {PrismaService} from '../prisma/prisma.service';

type EntitySpec={delegate:string;fields:readonly string[];filters:Record<string,'string'|'number'|'boolean'>;groups:readonly string[];base:Record<string,unknown>};
const entities:Record<string,EntitySpec>={
 stages:{delegate:'stage',fields:['id','seasonId','name','city','date','stageNumber','status','registrationOpen','resultsPublishedAt'],filters:{id:'string',seasonId:'string',city:'string',status:'string',registrationOpen:'boolean',stageNumber:'number'},groups:['seasonId','city','status','registrationOpen'],base:{isDeleted:false}},
 seasons:{delegate:'season',fields:['id','name','year','status','isActive'],filters:{id:'string',year:'number',status:'string',isActive:'boolean'},groups:['status','isActive','year'],base:{}},
 registrations:{delegate:'registration',fields:['stageId','participantNumber','source','status','registeredAt'],filters:{stageId:'string',source:'string',status:'string',participantNumber:'number'},groups:['stageId','status','source'],base:{stage:{isDeleted:false}}},
 results:{delegate:'result',fields:['value','unit','place','isHistorical','verificationStatus','createdAt'],filters:{unit:'string',place:'number',isHistorical:'boolean',verificationStatus:'string'},groups:['unit','place','isHistorical','verificationStatus'],base:{registration:{stage:{isDeleted:false}}}},
 classes:{delegate:'class',fields:['id','code','name','directionId','unit','isActive'],filters:{id:'string',code:'string',directionId:'string',unit:'string',isActive:'boolean'},groups:['directionId','unit','isActive'],base:{}},
 classEntries:{delegate:'registrationClass',fields:['classId','createdAt'],filters:{classId:'string'},groups:['classId'],base:{registration:{status:'ACTIVE',stage:{isDeleted:false}}}},
 cars:{delegate:'car',fields:['brand','model'],filters:{brand:'string',model:'string'},groups:['brand','model'],base:{isActive:true,isPublic:true,participant:{isPublic:true}}},
};
const own=(object:object,key:string)=>Object.prototype.hasOwnProperty.call(object,key);
const error=(message:string)=>({error:message});
export async function queryUsdResearchData(prisma:PrismaService,args:Record<string,unknown>){
 const entity=typeof args.entity==='string'?args.entity:'';
 const operation=typeof args.operation==='string'?args.operation:'';
 if(!own(entities,entity)||!['count','list','group'].includes(operation))return error('Недопустимая сущность или операция. Разрешены '+Object.keys(entities).join(', ')+'; count, list, group.');
 const spec=entities[entity];
 let raw:unknown=args.filters??{};
 if(typeof raw==='string'){try{raw=JSON.parse(raw)}catch{return error('filters должен быть JSON-объектом с простыми значениями')}}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return error('Недопустимый формат фильтров');
 const entries=Object.entries(raw);
 if(entries.length>8)return error('Слишком много фильтров');
 const where:Record<string,unknown>={...spec.base};
 for(const [key,value] of entries){
  if(!own(spec.filters,key)||typeof value!==spec.filters[key]||(typeof value==='string'&&(value.length<1||value.length>120))||(typeof value==='number'&&!Number.isSafeInteger(value)))return error('Недопустимый фильтр: '+key);
  where[key]=value;
 }
 const limit=typeof args.limit==='number'&&Number.isFinite(args.limit)?Math.max(1,Math.min(25,Math.floor(args.limit))):15;
 const delegate=(prisma as unknown as Record<string,{count:(q:unknown)=>Promise<number>;findMany:(q:unknown)=>Promise<unknown[]>;groupBy:(q:unknown)=>Promise<unknown[]>}>)[spec.delegate];
 try{
  if(operation==='count')return {entity,operation,count:await delegate.count({where})};
  if(operation==='group'){
   const group=typeof args.groupBy==='string'?args.groupBy:'';
   if(!spec.groups.includes(group))return error('Группировка разрешена по: '+spec.groups.join(', '));
   const rows=await delegate.groupBy({by:[group],where,_count:{_all:true},orderBy:{[group]:'asc'},take:limit});
   return {entity,operation,rows,limit,mayHaveMore:rows.length===limit};
  }
  const sort=typeof args.sortBy==='string'&&args.sortBy?args.sortBy:spec.fields[0];
  if(!spec.fields.includes(sort))return error('Сортировка по этому полю запрещена');
  const rows=await delegate.findMany({where,select:Object.fromEntries(spec.fields.map(field=>[field,true])),orderBy:{[sort]:args.order==='desc'?'desc':'asc'},take:limit});
  return {entity,operation,rows,limit,mayHaveMore:rows.length===limit};
 }catch{return error('Не удалось прочитать данные. Уточни допустимые значения фильтров.')}
}
