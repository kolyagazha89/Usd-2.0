import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { SiteSettingsService } from './site-settings.service';

@Controller('site-settings')
export class SiteSettingsController {
  constructor(private readonly service: SiteSettingsService) {}

  @Public()
  @Get('public')
  getPublic() {
    return this.service.getPublic();
  }

  @Roles('ADMIN')
  @Get()
  getAdmin() {
    return this.service.getAdmin();
  }

  @Roles('ADMIN')
  @Patch()
  update(@Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.service.update(body as any, request.user.sub);
  }
}