import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { UnclaimedTestPurgeService } from './unclaimed-test-purge.service';

@Controller('admin/imports/unclaimed-test-purge')
@Roles('ADMIN')
export class UnclaimedTestPurgeController {
  constructor(private readonly service: UnclaimedTestPurgeService) {}

  @Get('preview')
  preview() {
    return this.service.preview();
  }

  @Post('execute')
  execute(
    @Body() body: { confirmation?: string; fingerprint?: string; expectedParticipants?: number },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.execute(
      String(body?.confirmation ?? ''),
      String(body?.fingerprint ?? ''),
      Number(body?.expectedParticipants),
      request,
    );
  }
}
