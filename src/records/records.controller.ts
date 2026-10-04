import {
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { RecordsService } from './records.service';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('records')
export class RecordsController {
  constructor(
    private readonly recordsService: RecordsService,
  ) {}

  @Public()
  @Get()
  findAll() {
    return this.recordsService.findAll();
  }

  @Public()
  @Get('current')
  findCurrent() {
    return this.recordsService.findCurrent();
  }

  @Public()
  @Get('class/:classId')
  findByClass(@Param('classId') classId: string) {
    return this.recordsService.findByClass(classId);
  }

  @Public()
  @Get('season/:seasonId')
  findBySeason(@Param('seasonId') seasonId: string) {
    return this.recordsService.findBySeason(seasonId);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.recordsService.findOne(id);
  }

  @Roles('ADMIN')
  @Post('from-result/:resultId')
createFromResultManually(
  @Param('resultId') resultId: string,
) {
  return this.recordsService.createFromResultManually(
    resultId,
  );
}

@Roles('ADMIN')
@Post('from-result-auto/:resultId')
createFromResultAuto(
  @Param('resultId') resultId: string,
) {
  return this.recordsService.createFromResult(
    resultId,
  );
}
}