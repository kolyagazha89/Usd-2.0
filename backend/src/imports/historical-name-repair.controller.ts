import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { HistoricalNameRepairService } from './historical-name-repair.service';

@Controller('admin/imports/historical-name-repair')
@Roles('ADMIN')
export class HistoricalNameRepairController {
  constructor(private readonly service: HistoricalNameRepairService) {}

  @Get('preview')
  preview() { return this.service.preview(); }

  @Post('execute')
  execute(
    @Body() body: { confirmation?: string; fingerprint?: string; expectedCount?: number },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.execute(
      String(body?.confirmation ?? ''),
      String(body?.fingerprint ?? ''),
      Number(body?.expectedCount),
      request,
    );
  }
}
