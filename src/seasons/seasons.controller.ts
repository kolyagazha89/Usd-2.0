import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { SeasonsService } from './seasons.service';
import { CreateSeasonDto, UpdateSeasonDto } from '../stages/dto/season.dto';

@Controller('seasons')
@Roles('ADMIN')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get()
  findAll() {
    return this.seasonsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.seasonsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSeasonDto) {
    return this.seasonsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSeasonDto) {
    return this.seasonsService.update(id, dto);
  }
}
