import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { NoStoreInterceptor } from './push.no-store';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { PushService } from './push.service';
import {
  PushAnnouncementDto,
  PushPreferencesDto,
  PushSubscribeDto,
} from './push.dto';

@Controller('push')
@UseInterceptors(NoStoreInterceptor)
export class PushController {
  constructor(private readonly service: PushService) {}
  @Get('subscriptions') list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.user.sub);
  }
  @Put('subscriptions') subscribe(
    @Req() req: AuthenticatedRequest,
    @Body() body: PushSubscribeDto,
  ) {
    return this.service.subscribe(req.user.sub, body);
  }
  @Patch('subscriptions/:id') preferences(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: PushPreferencesDto,
  ) {
    return this.service.preferences(req.user.sub, id, body);
  }
  @Delete('subscriptions/:id') remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.remove(req.user.sub, id);
  }
}
@Controller('push/admin')
@UseInterceptors(NoStoreInterceptor)
export class PushAdminController {
  constructor(private readonly service: PushService) {}
  @Roles('ADMIN') @Get('messages') summary() {
    return this.service.summary();
  }
  @Roles('ADMIN') @Post('messages') announce(
    @Req() req: AuthenticatedRequest,
    @Body() body: PushAnnouncementDto,
  ) {
    return this.service.announce(req.user.sub, body);
  }
}
