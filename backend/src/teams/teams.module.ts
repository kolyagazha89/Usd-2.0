import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
@Module({
  imports: [PrismaModule],
  providers: [TeamsService],
  controllers: [TeamsController],
})
export class TeamsModule {}
