import {BadRequestException,ForbiddenException,Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';

/** Only page categories are recorded: no profile/registration IDs, query strings,
 * IP addresses, identifiers, raw user agents or identity cookies are stored.
 */
export const TRAFFIC_ROUTES=new Set([
 '/', '/stages', '/results', '/records', '/rules', '/participants', '/cars',
 '/news', '/teams', '/partners', '/documents', '/about', '/contacts', '/privacy',
 '/terms', '/consent',
]);
export type TrafficDevice='mobile'|'tablet'|'desktop';
type TrafficAggregate={day:Date|string;path:string;device:TrafficDevice;views:number};

export function normalizeTrafficPath(raw:unknown):string|null{
 if(typeof raw!=='string'||raw.length>120||!raw.startsWith('/')||raw.includes('\\')||raw.includes('%'))return null;
 const prefix=raw.split(/[?#]/,1)[0].split('/').filter(Boolean)[0];
 const result=prefix?'/'+prefix:'/';
 return TRAFFIC_ROUTES.has(result)?result:null;
}
export function trafficDevice(userAgent:unknown):TrafficDevice|null{
 if(typeof userAgent!=='string'||userAgent.length>1024||!/mozilla|android|iphone|ipad|safari|chrome|firefox/i.test(userAgent))return null;
 if(/bot|spider|crawler|headless|playwright|lighthouse|pagespeed|slurp/i.test(userAgent))return null;
 if(/ipad|tablet|kindle|silk|playbook/i.test(userAgent))return 'tablet';
 if(/mobi|iphone|android/i.test(userAgent))return 'mobile';
 return 'desktop';
}
export function summarizeTrafficRows(rows:TrafficAggregate[]){
 const devices:Record<TrafficDevice,number>={desktop:0,mobile:0,tablet:0};
 const byPage=new Map<string,number>(),byDate=new Map<string,number>();
 let views=0;
 for(const row of rows){
  if(!TRAFFIC_ROUTES.has(row.path)||!['desktop','mobile','tablet'].includes(row.device))continue;
  const count=Number(row.views);
  if(!Number.isSafeInteger(count)||count<0)continue;
  const day=typeof row.day==='string'?row.day.slice(0,10):row.day.toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;
  devices[row.device]+=count;
  byPage.set(row.path,(byPage.get(row.path)??0)+count);
  byDate.set(day,(byDate.get(day)??0)+count);
  views+=count;
 }
 return {periodDays:30,views,devices,
  pages:[...byPage].map(([path,count])=>({path,views:count})).sort((a,b)=>b.views-a.views),
  daily:[...byDate].map(([day,count])=>({day,views:count})).sort((a,b)=>a.day.localeCompare(b.day)),
  uniqueVisitorsAvailable:false,
 };
}

@Injectable()
export class TrafficService{
 private readonly quota=new Map<string,{minute:number;count:number}>();
 constructor(private readonly prisma:PrismaService){}
 async record(path:unknown,userAgent:unknown,origin:unknown,ip:unknown){
  const allowed=String(process.env.CORS_ORIGINS??'').split(',').map(s=>s.trim()).filter(Boolean);
  if(typeof origin!=='string'||!allowed.includes(origin))
   throw new ForbiddenException('Недопустимый источник аналитики USD');
  const normalized=normalizeTrafficPath(path);
  if(!normalized)throw new BadRequestException('Недопустимый публичный раздел');
  const device=trafficDevice(userAgent);
  if(!device)return; // crawlers, empty user agents, accessibility agents
  const client=typeof ip==='string'?ip:'unknown';
  const minute=Math.floor(Date.now()/60000);
  const previous=this.quota.get(client);
  if(previous?.minute===minute&&previous.count>=12)return;
  if(this.quota.size>5000)this.quota.clear(); // bounded in-memory abuse control
  this.quota.set(client,{minute,count:previous?.minute===minute?previous.count+1:1});
  // AuditLog already exists: no schema migration required. Deliberately
  // omit userId and ipAddress and never store a session or browser fingerprint.
  await this.prisma.auditLog.create({data:{
   userId:null,ipAddress:null,action:'PUBLIC_PAGE_VIEW',
   entity:'PublicSite',entityId:normalized,metadata:{device},
  }});
 }
 async summary(){
  const rows=await this.prisma.$queryRaw<TrafficAggregate[]>`
   SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC')::date AS day,
    "entityId" AS path, metadata->>'device' AS device,
    COUNT(*)::integer AS views
   FROM "AuditLog"
   WHERE action = 'PUBLIC_PAGE_VIEW' AND entity = 'PublicSite'
    AND "createdAt" >= NOW() - INTERVAL '30 days'
   GROUP BY 1,2,3 ORDER BY 1 ASC
  `;
  return summarizeTrafficRows(rows);
 }
}
