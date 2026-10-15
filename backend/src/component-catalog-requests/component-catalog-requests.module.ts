import { Module } from '@nestjs/common';
import { ComponentCatalogRequestsController } from './component-catalog-requests.controller';
import { ComponentCatalogRequestsService } from './component-catalog-requests.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [ComponentCatalogRequestsController],
  providers: [ComponentCatalogRequestsService],
})
export class ComponentCatalogRequestsModule {}
