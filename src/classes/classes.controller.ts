import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';

@Controller()
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  // =========================================================
  // DIRECTIONS
  // =========================================================

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
  createDirection(
    @Body()
    body: {
      name: string;
      sortOrder?: number;
    },
  ) {
    return this.classesService.createDirection(body);
  }

  @Roles('ADMIN')
  @Patch('directions/:id')
  updateDirection(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.classesService.updateDirection(id, body);
  }

  @Roles('ADMIN')
  @Delete('directions/:id')
  deleteDirection(@Param('id') id: string) {
    return this.classesService.deleteDirection(id);
  }

  // =========================================================
  // CLASSES
  // =========================================================

  @Public()
  @Get('classes')
  findAllClasses(
    @Query('directionId') directionId?: string,
  ) {
    return this.classesService.findAllClasses(directionId);
  }

  @Public()
  @Get('classes/:id')
  findClass(@Param('id') id: string) {
    return this.classesService.findClass(id);
  }

  @Roles('ADMIN')
  @Post('classes')
  createClass(
    @Body()
    body: {
      directionId: string;
      code: string;
      name: string;
      sortOrder?: number;
    },
  ) {
    return this.classesService.createClass(body);
  }

  @Roles('ADMIN')
  @Patch('classes/:id')
  updateClass(
    @Param('id') id: string,
    @Body()
    body: {
      directionId?: string;
      code?: string;
      name?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.classesService.updateClass(id, body);
  }

  @Roles('ADMIN')
  @Delete('classes/:id')
  deleteClass(@Param('id') id: string) {
    return this.classesService.deleteClass(id);
  }

  // =========================================================
  // STAGE CLASSES
  // =========================================================

  @Public()
  @Get('stages/:stageId/classes')
  findStageClasses(@Param('stageId') stageId: string) {
    return this.classesService.findStageClasses(stageId);
  }

  @Roles('ADMIN')
  @Post('stages/:stageId/classes')
  addClassToStage(
    @Param('stageId') stageId: string,
    @Body()
    body: {
      classId: string;
    },
  ) {
    return this.classesService.addClassToStage(
      stageId,
      body.classId,
    );
  }

  @Roles('ADMIN')
  @Put('stages/:stageId/classes')
  replaceStageClasses(
    @Param('stageId') stageId: string,
    @Body()
    body: {
      classIds: string[];
    },
  ) {
    return this.classesService.replaceStageClasses(
      stageId,
      body.classIds,
    );
  }

  @Roles('ADMIN')
  @Delete('stages/:stageId/classes/:classId')
  removeClassFromStage(
    @Param('stageId') stageId: string,
    @Param('classId') classId: string,
  ) {
    return this.classesService.removeClassFromStage(
      stageId,
      classId,
    );
  }
}