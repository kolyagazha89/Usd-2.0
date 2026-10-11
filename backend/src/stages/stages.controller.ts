import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { StagesService } from './stages.service';
import { CreateStageDto, UpdateStageDto } from './dto/stage.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Public()
  @Get()
  findAll() {
    return this.stagesService.findAll();
  }

  @Public()
  @Get('public')
  findPublished() {
    return this.stagesService.findPublished();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stagesService.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() body: CreateStageDto, @Req() request: AuthenticatedRequest) {
    return this.stagesService.create(body, request);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateStageDto, @Req() request: AuthenticatedRequest) {
    return this.stagesService.update(id, body, request);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.stagesService.remove(id, request);
  }
}
