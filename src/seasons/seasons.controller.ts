import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { SeasonsService } from './seasons.service';
import { CreateSeasonDto, UpdateSeasonDto } from '../stages/dto/season.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

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
  create(@Body() dto: CreateSeasonDto, @Req() request: AuthenticatedRequest) {
    return this.seasonsService.create(dto, request);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSeasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.seasonsService.update(id, dto, request);
  }
}
