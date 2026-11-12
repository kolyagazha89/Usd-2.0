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
      const stages=await this.stage.findMany({
        select:{id:true},
        take:2,
      });
      if (!stageId||stages.length!==1||stages[0].id!==stageId) {
        throw new Error('USD VENUE BLOCKED: exactly one pinned signed stage is required');
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