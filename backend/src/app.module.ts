import { PushModule } from './push/push.module';
import {AdminDeletionModule} from './admin-deletion/admin-deletion.module';
import { Module } from '@nestjs/common';

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
import { StatisticsModule } from './statistics/statistics.module';
import { GoogleModule } from './google/google.module';
import { SiteSettingsModule } from './site-settings/site-settings.module';
import { AssistantModule } from './assistant/assistant.module';
import { NormalizationDryRunModule } from './data-quality/normalization-dry-run.module';
import { ComponentCatalogRequestsModule } from './component-catalog-requests/component-catalog-requests.module';
import { TeamsModule } from './teams/teams.module';

@Module({
  imports: [
    PrismaModule,
    AdminDeletionModule,
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
    StatisticsModule,
    GoogleModule,
    SiteSettingsModule,
    AssistantModule,
    NormalizationDryRunModule,
    ComponentCatalogRequestsModule,
    TeamsModule,
    PushModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
