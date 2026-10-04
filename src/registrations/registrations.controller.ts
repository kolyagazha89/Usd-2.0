
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { RegistrationsService } from './registrations.service';

@Controller('registrations')
export class RegistrationsController {
  constructor(
    private readonly registrationsService: RegistrationsService,
  ) {}

  // Получить список регистраций.
  // Можно фильтровать по этапу и статусу.
  @Get()
  findAll(
    @Query('stageId') stageId?: string,
    @Query('status') status?: 'ACTIVE' | 'CANCELLED',
  ) {
    return this.registrationsService.findAll(stageId, status);
  }

  // Получить регистрацию по ID.
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.registrationsService.findOne(id);
  }

  // Создать регистрацию.
  @Post()
  create(
    @Body()
    body: {
      stageId: string;
      participantId: string;
      carId: string;
      classIds: string[];
      configurationId?: string;
      source?: 'PRE_REGISTRATION' | 'ON_SITE' | 'IMPORT';
    },
  ) {
    return this.registrationsService.create(body);
  }

  // Изменить выбранные классы регистрации.
  @Patch(':id/classes')
  updateClasses(
    @Param('id') id: string,
    @Body()
    body: {
      classIds: string[];
    },
  ) {
    return this.registrationsService.updateClasses(id, body.classIds);
  }

  // Отменить регистрацию, сохранив историю.
    @Delete(':id')
    cancel(@Param('id') id: string) {
        return this.registrationsService.cancel(id);
    }
    @Post(':id/restore')
    restore(@Param('id') id: string) {
    return this.registrationsService.restore(id);
    }
}