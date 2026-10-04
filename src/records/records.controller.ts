import { Controller, Get, Param } from '@nestjs/common';
import { RecordsService } from './records.service';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

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

  @Roles('ADMIN')
  @Get('admin/current')
  findCurrentAdmin() {
    return this.recordsService.findCurrentAdmin();
  }

  @Roles('ADMIN')
  @Get('admin/history')
  findAllAdmin() {
    return this.recordsService.findAllAdmin();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.recordsService.findOne(id);
  }
}
