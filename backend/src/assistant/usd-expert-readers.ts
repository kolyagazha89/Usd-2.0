import {PrismaService} from '../prisma/prisma.service';
import {usdHelpTopic} from './usd-knowledge';

type Args=Record<string,unknown>;
export async function usdExpertRead(prisma:PrismaService,name:string,args:Args):Promise<unknown>{
 const stageId=typeof args.stageId==='string' && /^[a-zA-Z0-9-]{1,80}$/.test(args.stageId)?args.stageId:undefined;
 const query=typeof args.query==='string'?args.query.trim().slice(0,80):'';
 if(name==='usd_stages'){
  return prisma.stage.findMany({where:{isDeleted:false},orderBy:[{date:'desc'}],take:20,
   select:{id:true,name:true,city:true,date:true,status:true,registrationOpen:true,stageNumber:true}});
 }
 if(name==='usd_classes'){
  const selected={code:true,name:true,unit:true,direction:{select:{name:true}}} as const;
  if(stageId){
   const items=await prisma.stageClass.findMany({where:{stageId,isActive:true},take:100,
    select:{customName:true,description:true,class:{select:selected}}});
   return items.map(item=>({
    direction:item.class.direction.name,code:item.class.code,name:item.customName||item.class.name,
    unit:item.class.unit,description:item.description,
   }));
  }
  const rows=await prisma.class.findMany({where:{isActive:true},take:100,orderBy:[{sortOrder:'asc'}],select:selected});
  return rows.map(item=>({direction:item.direction.name,code:item.code,name:item.name,unit:item.unit}));
 }
 if(name==='usd_rules'){
  const topic=typeof args.topic==='string'?args.topic:'all';
  const row=await prisma.siteSettings.findUnique({where:{id:'default'},select:{registration:true}});
  const registration=(row?.registration??{}) as Record<string,any>;
  const published=registration.rulesDocument?.published;
  const blocks=Array.isArray(published?.blocks)?published.blocks:[];
  const text=blocks.map((block:any)=>
    typeof block?.text==='string'?block.text:
    Array.isArray(block?.runs)?block.runs.map((run:any)=>String(run?.text??'')).join(''):''
  ).filter(Boolean).join('\n').slice(0,12000);
  return {topic,guide:usdHelpTopic(topic),publishedRules:published?{
   revisionId:String(published.id??''),publishedAt:String(published.publishedAt??''),
   text:text||'Не удалось извлечь текст опубликованного регламента; открой документ на сайте.',
  }:null,note:'При расхождении справки и регламента приоритет у опубликованного регламента.'};
 }
 if(name==='usd_search_registrations'){
  if(query.length<2 && !/^\d$/.test(query))return {error:'Для поиска нужно минимум два символа или стартовый номер'};
  const number=/^\d{1,6}$/.test(query)?Number(query):undefined;
  const contains={contains:query,mode:'insensitive' as const};
  const rows=await prisma.registration.findMany({
   where:{status:'ACTIVE',...(stageId?{stageId}:{}),
    OR:[
     ...(number!==undefined?[{participantNumber:number}]:[]),
     {participant:{OR:[{firstName:contains},{lastName:contains},{middleName:contains}]}},
     {car:{OR:[{brand:contains},{model:contains}]}},
     {classes:{some:{class:{OR:[{name:contains},{code:contains}]}}}},
    ],
   },
   take:12,orderBy:[{registeredAt:'desc'}],
   select:{
    participantNumber:true,
    participant:{select:{firstName:true,lastName:true,middleName:true,isPublic:true}},
    car:{select:{brand:true,model:true,isActive:true}},
    stage:{select:{name:true,date:true}},
    classes:{take:10,select:{class:{select:{name:true,code:true,direction:{select:{name:true}}}},number:{select:{number:true}}}},
    stageInspection:{select:{status:true}},inspection:{select:{status:true}},
    results:{take:10,select:{value:true,unit:true,place:true,registrationClass:{select:{class:{select:{code:true}}}}}},
   },
  });
  return {matches:rows.map(row=>({
   participant:row.participant.isPublic
    ? [row.participant.lastName,row.participant.firstName,row.participant.middleName].filter(Boolean).join(' ')
    : 'Скрытый профиль',
   number:row.participantNumber,stage:row.stage.name,date:row.stage.date,
   car:row.car.isActive?[row.car.brand,row.car.model].join(' '):'Скрытый автомобиль',
   inspection:row.stageInspection?.status??row.inspection?.status??'PENDING',
   classes:row.classes.map(c=>({direction:c.class.direction.name,class:c.class.name,code:c.class.code,number:c.number.number})),
   results:row.results.map(r=>({classCode:r.registrationClass.class.code,value:r.value,unit:r.unit,place:r.place})),
  })),hasMore:rows.length===12};
 }
 if(name==='usd_stage_results'){
  const stage=stageId
   ?await prisma.stage.findUnique({where:{id:stageId},select:{id:true,name:true,date:true,status:true,isDeleted:true,resultsPublishedAt:true}})
   :await prisma.stage.findFirst({where:{isDeleted:false,status:'COMPLETED'},orderBy:{date:'desc'},
     select:{id:true,name:true,date:true,status:true,isDeleted:true,resultsPublishedAt:true}});
  if(!stage||stage.isDeleted)return {error:'Этап не найден. Выбери конкретный этап.'};
  const rows=await prisma.result.findMany({
   where:{registration:{stageId:stage.id}},
   take:100,orderBy:[{place:'asc'},{createdAt:'desc'}],
   select:{
    value:true,unit:true,place:true,isHistorical:true,
    registration:{select:{participantNumber:true,participant:{select:{
     firstName:true,lastName:true,middleName:true,isPublic:true,
    }}}},
    registrationClass:{select:{class:{select:{name:true,code:true,direction:{select:{name:true}}}}}},
   },
  });
  const groups=new Map<string,Array<Record<string,unknown>>>();
  for(const row of rows){
   const key=row.registrationClass.class.code;
   const group=groups.get(key)??[];
   if(group.length>=5)continue;
   group.push({
    participant:row.registration.participant.isPublic
     ?[row.registration.participant.lastName,row.registration.participant.firstName,row.registration.participant.middleName].filter(Boolean).join(' ')
     :'Скрытый профиль',
    number:row.registration.participantNumber,place:row.place,value:row.value,unit:row.unit,
   });
   groups.set(key,group);
  }
  return {stage:{name:stage.name,date:stage.date,status:stage.status,
    published:Boolean(stage.resultsPublishedAt)},
   classes:[...groups.entries()].map(([code,results])=>({code,results})),
   totalSample:rows.length,truncated:rows.length===100,
   note:stage.resultsPublishedAt?'Результаты опубликованы.':'Результаты ещё не опубликованы: не выдавать за официальный протокол.'};
 }
 if(name==='usd_search_results'){
  if(query.length<2)return {error:'Для поиска нужно минимум два символа'};
  const number=/^\d{1,6}$/.test(query)?Number(query):undefined;
  const contains={contains:query,mode:'insensitive' as const};
  const rows=await prisma.result.findMany({
   where:{
    ...(stageId?{registration:{stageId}}:{}),
    OR:[
     {registrationClass:{class:{OR:[{name:contains},{code:contains}]}}},
     {registration:{participant:{OR:[{firstName:contains},{lastName:contains},{middleName:contains}]}}},
     ...(number!==undefined?[{registration:{participantNumber:number}}]:[]),
    ],
   },
   take:12,orderBy:[{createdAt:'desc'}],
   select:{
    value:true,unit:true,place:true,isHistorical:true,verificationStatus:true,
    registration:{select:{participantNumber:true,stage:{select:{name:true,date:true}},
     participant:{select:{firstName:true,lastName:true,middleName:true,isPublic:true}}}},
    registrationClass:{select:{class:{select:{name:true,code:true,direction:{select:{name:true}}}}}},
   },
  });
  return {matches:rows.map(row=>({
   participant:row.registration.participant.isPublic
    ?[row.registration.participant.lastName,row.registration.participant.firstName,row.registration.participant.middleName].filter(Boolean).join(' ')
    :'Скрытый профиль',
   number:row.registration.participantNumber,stage:row.registration.stage.name,date:row.registration.stage.date,
   class:row.registrationClass.class.name,direction:row.registrationClass.class.direction.name,
   code:row.registrationClass.class.code,value:row.value,unit:row.unit,place:row.place,
   historical:row.isHistorical,verification:row.verificationStatus,
  })),hasMore:rows.length===12};
 }
 throw new Error('Unknown USD read-only lookup');
}
