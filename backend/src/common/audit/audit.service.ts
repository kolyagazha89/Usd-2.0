import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {resolveAuditContexts} from './audit-context';

function moscowDay(value:string|undefined,end=false){
 if(!value)return undefined;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new BadRequestException('Некорректная дата аудита');
 const utc=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(utc.getTime())||utc.toISOString().slice(0,10)!==value)throw new BadRequestException('Некорректная дата аудита');
 return new Date(utc.getTime()-3*3600000+(end?86400000:0));
}

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry) {
    return this.prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata ?? undefined,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }

  async list(params: {
    page?: number;
    limit?: number;
    entity?: string;
    action?: string;
    search?: string;
    from?: string;
    to?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const search=params.search?.trim().slice(0,200);
    const from=moscowDay(params.from),to=moscowDay(params.to,true);
    if(from&&to&&from>=to)throw new BadRequestException('Начало периода позже окончания');
    const base:Prisma.AuditLogWhereInput={
      ...(from||to?{createdAt:{...(from?{gte:from}:{}),...(to?{lt:to}:{})}}:{}),
      ...(search?{OR:[
        {user:{is:{name:{contains:search,mode:'insensitive'}}}},
        {user:{is:{email:{contains:search,mode:'insensitive'}}}},
        {user:{is:{customRole:{is:{name:{contains:search,mode:'insensitive'}}}}}},
        {entityId:search},{id:search},{userId:search},
      ]}:{}),
    };
    const where:Prisma.AuditLogWhereInput={
      ...base,
      ...(params.entity?{entity:params.entity}:{}),
      // Traffic remains separate unless explicitly selected.
      action:params.action||{not:'PUBLIC_PAGE_VIEW'},
    };
    const [total, items, facets] = await Promise.all([
      this.prisma.auditLog.count({where}),
      this.prisma.auditLog.findMany({
        where,
        orderBy:[{createdAt:'desc'},{id:'desc'}],
        skip:(page-1)*limit,
        take:limit,
        select:{
          id:true,userId:true,action:true,entity:true,entityId:true,metadata:true,ipAddress:true,createdAt:true,
          user:{select:{id:true,name:true,email:true,role:true,customRole:{select:{name:true}}}},
        },
      }),
      this.prisma.auditLog.groupBy({by:['entity','action'],where:{...base,action:{not:'PUBLIC_PAGE_VIEW'}}}),
    ]);
    return {
      items:await resolveAuditContexts(this.prisma,items),
      filters:{
        entities:[...new Set(facets.map(row=>row.entity))].sort(),
        actions:[...new Set(facets.filter(row=>!params.entity||row.entity===params.entity).map(row=>row.action))].sort(),
      },
      pagination:{page,limit,total,pages:Math.ceil(total/limit)},
    };
  }
}
