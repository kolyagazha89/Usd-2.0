import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { StagesService } from './stages.service';
import { CreateStageDto, UpdateStageDto } from './dto/stage.dto';

@Controller('stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Public() @Get() findAll() { return this.stagesService.findAll(); }
  @Public() @Get(':id') findOne(@Param('id') id: string) { return this.stagesService.findOne(id); }

  @Roles('ADMIN') @Post()
  create(@Body() body: CreateStageDto) {
    return this.stagesService.create(body);
  }

  @Roles('ADMIN') @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateStageDto) {
    return this.stagesService.update(id, body);
  }

  @Roles('ADMIN') @Delete(':id') remove(@Param('id') id: string) { return this.stagesService.remove(id); }
}
