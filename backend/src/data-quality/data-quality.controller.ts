import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { DataQualityService } from './data-quality.service';

@Controller('data-quality')
@Roles('ADMIN')
export class DataQualityController {
  constructor(private readonly dataQualityService: DataQualityService) {}

  @Get('report')
  getReport() {
    return this.dataQualityService.getReport();
  }
}
