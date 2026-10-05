import {Body,Controller,Get,Patch,Req} from '@nestjs/common';
import {Roles} from '../auth/roles.decorator';
import {Public} from '../auth/public.decorator';
import {SiteSettingsService} from './site-settings.service';
import type {AuthenticatedRequest} from '../auth/authenticated-request';

@Controller('site-settings')
export class SiteSettingsController{
  constructor(private readonly service:SiteSettingsService){}
  @Roles('ADMIN') @Get() getAdmin(){return this.service.getAdmin();}
  @Roles('ADMIN') @Patch() update(@Body() body:Record<string,unknown>,@Req() req:AuthenticatedRequest){return this.service.update(body,req.user.sub);}
  @Public() @Get('public') getPublic(){return this.service.getPublic();}
}
