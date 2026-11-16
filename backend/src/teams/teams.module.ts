import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamManagementService } from './team-management.service';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
@Module({
  imports: [PrismaModule],
  providers: [TeamsService, TeamManagementService],
  controllers: [TeamsController],
})
export class TeamsModule {}
