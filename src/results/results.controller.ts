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
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CreateResultDto, UpdateResultDto } from './dto/result.dto';

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
  @Public()
  @Get('stage/:stageId')
  findByStage(@Param('stageId') stageId: string) {
    return this.resultsService.findByStage(stageId);
  }

  /**
   * Результаты конкретной регистрации.
   */
  @Public()
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
  @Public()
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
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.resultsService.findOne(id);
  }

  @Roles('ADMIN', 'JUDGE')
  @Post()
  create(
    @Body() body: CreateResultDto,
  ) {
    return this.resultsService.create(body);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateResultDto,
  ) {
    return this.resultsService.update(id, body);
  }
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.resultsService.remove(id);
  }
}