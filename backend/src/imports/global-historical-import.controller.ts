import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { GlobalHistoricalImportService } from './global-historical-import.service';

@Controller('imports/historical/global')
@Roles('ADMIN')
export class GlobalHistoricalImportController {
  constructor(private readonly imports: GlobalHistoricalImportService) {}
  @Post('start') start(@Req() request: AuthenticatedRequest) { return this.imports.start(request); }
  @Get('latest') latest() { return this.imports.latest(); }
  @Get('preflight') preflight() { return this.imports.preflight(); }
  @Get(':id/report') report(@Param('id') id: string) { return this.imports.report(id); }
  @Get(':id') status(@Param('id') id: string) { return this.imports.status(id); }
}
