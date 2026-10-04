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