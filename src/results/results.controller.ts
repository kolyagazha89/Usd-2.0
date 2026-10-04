import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { ResultsService } from './results.service';

@Controller('results')
export class ResultsController {
  constructor(
    private readonly resultsService: ResultsService,
  ) {}

  /**
   * Все результаты этапа.
   *
   * Основной endpoint для публичного React-интерфейса.
   */
  @Get('stage/:stageId')
  findByStage(@Param('stageId') stageId: string) {
    return this.resultsService.findByStage(stageId);
  }

  /**
   * Результаты конкретной регистрации.
   */
  @Get('registration/:registrationId')
  findByRegistration(
    @Param('registrationId') registrationId: string,
  ) {
    return this.resultsService.findByRegistration(
      registrationId,
    );
  }

  /**
   * Результаты конкретного класса регистрации.
   */
  @Get('registration-class/:registrationClassId')
  findByRegistrationClass(
    @Param('registrationClassId') registrationClassId: string,
  ) {
    return this.resultsService.findByRegistrationClass(
      registrationClassId,
    );
  }

  /**
   * Конкретный результат.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.resultsService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      registrationId: string;
      registrationClassId: string;
      value: number;
      unit: 'DB' | 'MPS' | 'OTHER';
      place?: number;
      notes?: string;
    },
  ) {
    return this.resultsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      value?: number;
      unit?: 'DB' | 'MPS' | 'OTHER';
      place?: number | null;
      notes?: string | null;
    },
  ) {
    return this.resultsService.update(id, body);
  }
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.resultsService.remove(id);
  }
}