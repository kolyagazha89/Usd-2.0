import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { StagesService } from './stages.service';

@Controller('stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Public() @Get() findAll() { return this.stagesService.findAll(); }
  @Public() @Get(':id') findOne(@Param('id') id: string) { return this.stagesService.findOne(id); }

  @Roles('ADMIN') @Post()
  create(@Body() body: { seasonYear: number; seasonName?: string; stageNumber: number; name: string; city?: string; date: string; registrationOpen?: boolean; registrationStartsAt?: string; registrationEndsAt?: string; }) {
    return this.stagesService.create(body);
  }

  @Roles('ADMIN') @Patch(':id')
  update(@Param('id') id: string, @Body() body: { stageNumber?: number; name?: string; city?: string; date?: string; registrationOpen?: boolean; registrationStartsAt?: string | null; registrationEndsAt?: string | null; }) {
    return this.stagesService.update(id, body);
  }

  @Roles('ADMIN') @Delete(':id') remove(@Param('id') id: string) { return this.stagesService.remove(id); }
}
