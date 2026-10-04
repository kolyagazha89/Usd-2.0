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

@Controller()
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  // =========================================================
  // DIRECTIONS
  // =========================================================

  @Get('directions')
  findAllDirections() {
    return this.classesService.findAllDirections();
  }

  @Get('directions/:id')
  findDirection(@Param('id') id: string) {
    return this.classesService.findDirection(id);
  }

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

  @Delete('directions/:id')
  deleteDirection(@Param('id') id: string) {
    return this.classesService.deleteDirection(id);
  }

  // =========================================================
  // CLASSES
  // =========================================================

  @Get('classes')
  findAllClasses(
    @Query('directionId') directionId?: string,
  ) {
    return this.classesService.findAllClasses(directionId);
  }

  @Get('classes/:id')
  findClass(@Param('id') id: string) {
    return this.classesService.findClass(id);
  }

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

  @Delete('classes/:id')
  deleteClass(@Param('id') id: string) {
    return this.classesService.deleteClass(id);
  }

  // =========================================================
  // STAGE CLASSES
  // =========================================================

  @Get('stages/:stageId/classes')
  findStageClasses(@Param('stageId') stageId: string) {
    return this.classesService.findStageClasses(stageId);
  }

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