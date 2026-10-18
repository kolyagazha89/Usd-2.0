import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { HistoricalOrphanCleanupService } from './historical-orphan-cleanup.service';

@Controller('admin/imports/historical-orphans')
@Roles('ADMIN')
export class HistoricalOrphanCleanupController {
  constructor(private readonly service: HistoricalOrphanCleanupService) {}

  @Get('preview')
  preview() {
    return this.service.preview();
  }

  @Post('execute')
  execute(
    @Body() body: { confirmation?: string; fingerprint?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.execute(
      String(body?.confirmation ?? ''),
      String(body?.fingerprint ?? ''),
      request,
    );
  }
}
