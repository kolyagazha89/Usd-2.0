import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';

import { ConfigurationsService } from './configurations.service';
import { Roles } from '../auth/roles.decorator';

import { CreateConfigurationDto } from './dto/create-configuration.dto';
import { UpdateConfigurationDto } from './dto/update-configuration.dto';

@Controller()
export class ConfigurationsController {
  constructor(
    private readonly configurationsService: ConfigurationsService,
  ) {}

  // =========================================================
  // CAR CONFIGURATIONS
  // =========================================================

  @Roles('ADMIN', 'JUDGE', 'PARTICIPANT')
  @Get('cars/:carId/configurations')
  findByCar(
    @Req() request: any,
    @Param('carId') carId: string,
  ) {
    return this.configurationsService.findByCar(
      request,
      carId,
    );
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Post('cars/:carId/configurations')
  create(
    @Req() request: any,
    @Param('carId') carId: string,
    @Body() body: CreateConfigurationDto,
  ) {
    return this.configurationsService.create(
      request,
      carId,
      body,
    );
  }

  // =========================================================
  // SINGLE CONFIGURATION
  // =========================================================

  @Roles('ADMIN', 'JUDGE', 'PARTICIPANT')
  @Get('configurations/:configurationId')
  findOne(
    @Req() request: any,
    @Param('configurationId') configurationId: string,
  ) {
    return this.configurationsService.findOne(
      request,
      configurationId,
    );
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Put('configurations/:configurationId')
  update(
    @Req() request: any,
    @Param('configurationId') configurationId: string,
    @Body() body: UpdateConfigurationDto,
  ) {
    return this.configurationsService.update(
      request,
      configurationId,
      body,
    );
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Delete('configurations/:configurationId')
  remove(
    @Req() request: any,
    @Param('configurationId') configurationId: string,
  ) {
    return this.configurationsService.remove(
      request,
      configurationId,
    );
  }

  // =========================================================
  // VERSIONS
  // =========================================================

  @Roles('ADMIN', 'JUDGE', 'PARTICIPANT')
  @Get(
    'configurations/:configurationId/versions',
  )
  findVersions(
    @Req() request: any,
    @Param('configurationId') configurationId: string,
  ) {
    return this.configurationsService.findVersions(
      request,
      configurationId,
    );
  }

  @Roles('ADMIN', 'JUDGE', 'PARTICIPANT')
  @Get(
    'configurations/:configurationId/versions/:version',
  )
  findVersion(
    @Req() request: any,
    @Param('configurationId') configurationId: string,
    @Param(
      'version',
      ParseIntPipe,
    )
    version: number,
  ) {
    return this.configurationsService.findVersion(
      request,
      configurationId,
      version,
    );
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Post(
    'configurations/:configurationId/versions',
  )
  createVersion(
    @Req() request: any,
    @Param('configurationId') configurationId: string,
  ) {
    return this.configurationsService.createVersion(
      request,
      configurationId,
    );
  }
}