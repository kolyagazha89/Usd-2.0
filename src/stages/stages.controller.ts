import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { StagesService } from './stages.service';

@Controller('stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Get()
  findAll() {
    return this.stagesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stagesService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      seasonYear: number;
      seasonName?: string;
      stageNumber: number;
      name: string;
      city?: string;
      date: string;
      registrationOpen?: boolean;
      registrationStartsAt?: string;
      registrationEndsAt?: string;
    },
  ) {
    return this.stagesService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      stageNumber?: number;
      name?: string;
      city?: string;
      date?: string;
      registrationOpen?: boolean;
      registrationStartsAt?: string | null;
      registrationEndsAt?: string | null;
    },
  ) {
    return this.stagesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.stagesService.remove(id);
  }
}