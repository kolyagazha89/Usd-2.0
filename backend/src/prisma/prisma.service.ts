import 'dotenv/config';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    // The central Ubuntu instance never sets USD_VENUE_LAN_MODE. The venue
    // instance must fail startup rather than accidentally judge using a DB
    // initialized with the historic app-as-superuser configuration.
    if (process.env.USD_VENUE_LAN_MODE === 'true') {
      const roles = await this.$queryRawUnsafe<Array<{rolsuper:boolean}>>(
        'SELECT rolsuper FROM pg_roles WHERE rolname = current_user',
      );
      if (roles.length !== 1 || roles[0].rolsuper !== false) {
        throw new Error('USD VENUE BLOCKED: DB application must not be PostgreSQL superuser');
      }
      const stageId=process.env.VENUE_STAGE_ID;
      if (!stageId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stageId)) {
        throw new Error('USD VENUE BLOCKED: invalid signed active stage UUID');
      }
      // Historical stages stay in this SAME PostgreSQL. The running API must
      // serve the currently signed stage only; the root-owned selector, not a
      // client-supplied stage ID or a table count, authorizes that selection.
      const stages=await this.stage.findMany({
        where:{id:stageId},select:{id:true},take:1,
      });
      if(stages.length!==1){
        throw new Error('USD VENUE BLOCKED: signed stage is missing from local history');
      }
      const selected=await this.$queryRawUnsafe<Array<{stageId:string}>>(
        'SELECT stage_id AS "stageId" FROM venue_private.active_stage',
      );
      if(selected.length!==1||selected[0].stageId!==stageId){
        throw new Error('USD VENUE BLOCKED: protected active stage does not match signed runtime');
      }
      // The journal must be installed AFTER the original signed import but
      // BEFORE any judge can submit a registration, inspection or result.
      // Abort the API entirely rather than silently losing offline writes.
      const journal = await this.$queryRawUnsafe<Array<{count:number}>>(
        "SELECT count(*)::int AS count FROM pg_trigger " +
        "WHERE tgname LIKE 'usd_venue_%_journal' AND tgenabled='O' AND NOT tgisinternal",
      );
      if (journal.length!==1 || journal[0].count!==19) {
        throw new Error('USD VENUE BLOCKED: durable operation journal is not installed');
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}