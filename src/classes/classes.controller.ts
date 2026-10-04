import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import {
  AddStageClassDto,
  CreateClassDto,
  CreateDirectionDto,
  ReplaceStageClassesDto,
  UpdateClassDto,
  UpdateDirectionDto,
  UpdateStageClassDto,
} from './dto/class.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller()
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Public()
  @Get('directions')
  findAllDirections() {
    return this.classesService.findAllDirections();
  }

  @Public()
  @Get('directions/:id')
  findDirection(@Param('id') id: string) {
    return this.classesService.findDirection(id);
  }

  @Roles('ADMIN')
  @Post('directions')
  createDirection(@Body() dto: CreateDirectionDto, @Req() request: AuthenticatedRequest) {
    return this.classesService.createDirection(dto, request);
  }

  @Roles('ADMIN')
  @Patch('directions/:id')
  updateDirection(@Param('id') id: string, @Body() dto: UpdateDirectionDto, @Req() request: AuthenticatedRequest) {
    return this.classesService.updateDirection(id, dto, request);
  }

  @Roles('ADMIN')
  @Delete('directions/:id')
  deleteDirection(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.classesService.deleteDirection(id, request);
  }

  @Public()
  @Get('classes')
  findAllClasses(@Query('directionId') directionId?: string) {
    return this.classesService.findAllClasses(directionId);
  }

  @Public()
  @Get('classes/:id')
  findClass(@Param('id') id: string) {
    return this.classesService.findClass(id);
  }

  @Roles('ADMIN')
  @Post('classes')
  createClass(@Body() dto: CreateClassDto, @Req() request: AuthenticatedRequest) {
    return this.classesService.createClass(dto, request);
  }

  @Roles('ADMIN')
  @Patch('classes/:id')
  updateClass(@Param('id') id: string, @Body() dto: UpdateClassDto, @Req() request: AuthenticatedRequest) {
    return this.classesService.updateClass(id, dto, request);
  }

  @Roles('ADMIN')
  @Delete('classes/:id')
  deleteClass(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.classesService.deleteClass(id, request);
  }

  @Public()
  @Get('stages/:stageId/classes')
  findStageClasses(
    @Param('stageId') stageId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.classesService.findStageClasses(stageId, includeInactive === 'true');
  }

  @Roles('ADMIN')
  @Post('stages/:stageId/classes')
  addClassToStage(
    @Param('stageId') stageId: string,
    @Body() dto: AddStageClassDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.classesService.addClassToStage(stageId, dto, request);
  }

  @Roles('ADMIN')
  @Patch('stages/:stageId/classes/:classId')
  updateStageClass(
    @Param('stageId') stageId: string,
    @Param('classId') classId: string,
    @Body() dto: UpdateStageClassDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.classesService.updateStageClass(stageId, classId, dto, request);
  }

  @Roles('ADMIN')
  @Put('stages/:stageId/classes')
  replaceStageClasses(
    @Param('stageId') stageId: string,
    @Body() dto: ReplaceStageClassesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.classesService.replaceStageClasses(stageId, dto, request);
  }

  @Roles('ADMIN')
  @Delete('stages/:stageId/classes/:classId')
  removeClassFromStage(
    @Param('stageId') stageId: string,
    @Param('classId') classId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.classesService.removeClassFromStage(stageId, classId, request);
  }
}
