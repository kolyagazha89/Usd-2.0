import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { StagesService } from './stages.service';
import { CreateStageDto, UpdateStageDto } from './dto/stage.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Roles('ADMIN', 'JUDGE')
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
  @Get('public/:id')
  findPublishedOne(@Param('id') id: string) {
    return this.stagesService.findPublishedOne(id);
  }

  @Roles('ADMIN', 'JUDGE')
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
  @Post(':id/results-publication')
  setResultsPublication(
    @Param('id') id: string,
    @Body() body: { published?: boolean; confirmed?: boolean },
    @Req() request: AuthenticatedRequest,
  ) {
    if (typeof body.published !== 'boolean') {
      throw new BadRequestException('Поле published должно быть true или false');
    }
    return this.stagesService.setResultsPublication(
      id,
      body.published,
      body.confirmed === true,
      request,
    );
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
