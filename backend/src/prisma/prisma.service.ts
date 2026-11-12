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
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}