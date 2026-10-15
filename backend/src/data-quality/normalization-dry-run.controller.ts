import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { NormalizationDryRunService } from './normalization-dry-run.service';

@Controller('admin/data-quality')
@Roles('ADMIN')
export class NormalizationDryRunController {
  constructor(private readonly service: NormalizationDryRunService) {}

  @Get('normalization/dry-run')
  run() {
    return this.service.run();
  }
}
