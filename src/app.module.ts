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

@Module({
  imports: [
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
