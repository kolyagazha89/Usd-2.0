import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { Roles } from '../auth/roles.decorator';
import { HistoricalImportResetService } from './historical-import-reset.service';

@Controller('admin/imports/historical-reset')
@Roles('ADMIN')
export class HistoricalImportResetController {
  constructor(private readonly service: HistoricalImportResetService) {}

  @Get('preview')
  preview() {
    return this.service.preview();
  }

  @Post('execute')
  execute(@Body() body: { confirmation?: string }, @Req() req: AuthenticatedRequest) {
    return this.service.execute(String(body?.confirmation ?? ''), req);
  }
}
