import {
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { RecordsService } from './records.service';

@Controller('records')
export class RecordsController {
  constructor(
    private readonly recordsService: RecordsService,
  ) {}

  @Get()
  findAll() {
    return this.recordsService.findAll();
  }

  @Get('current')
  findCurrent() {
    return this.recordsService.findCurrent();
  }

  @Get('class/:classId')
  findByClass(@Param('classId') classId: string) {
    return this.recordsService.findByClass(classId);
  }

  @Get('season/:seasonId')
  findBySeason(@Param('seasonId') seasonId: string) {
    return this.recordsService.findBySeason(seasonId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.recordsService.findOne(id);
  }

  @Post('from-result/:resultId')
createFromResultManually(
  @Param('resultId') resultId: string,
) {
  return this.recordsService.createFromResultManually(
    resultId,
  );
}

@Post('from-result-auto/:resultId')
createFromResultAuto(
  @Param('resultId') resultId: string,
) {
  return this.recordsService.createFromResult(
    resultId,
  );
}
}