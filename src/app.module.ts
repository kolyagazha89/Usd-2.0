import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';

import { StagesModule } from './stages/stages.module';
import { ClassesModule } from './classes/classes.module';
import { ParticipantsModule } from './participants/participants.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { InspectionsModule } from './inspections/inspections.module';
import { ResultsModule } from './results/results.module';
import { RecordsModule } from './records/records.module';
import { HistoryModule } from './history/history.module';
import { NameNormalizerModule } from './common/names/name-normalizer.module';
import { ImportsModule } from './imports/imports.module';
import { DisqualificationsModule } from './disqualifications/disqualifications.module';
import { ConfigurationsModule } from './configurations/configurations.module';
import { MediaModule } from './media/media.module';
import { AuditModule } from './common/audit/audit.module';
import { SeasonsModule } from './seasons/seasons.module';
import { HistoricalResultsModule } from './historical-results/historical-results.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    MailModule,
    StagesModule,
    ClassesModule,
    ParticipantsModule,
    RegistrationsModule,
    InspectionsModule,
    ResultsModule,
    RecordsModule,
    HistoryModule,
    NameNormalizerModule,
    ImportsModule,
    DisqualificationsModule,
    ConfigurationsModule,
    MediaModule,
    AuditModule,
    SeasonsModule,
    HistoricalResultsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
