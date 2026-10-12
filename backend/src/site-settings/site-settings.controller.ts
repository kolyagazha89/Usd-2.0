import {Body,Controller,Get,Patch,Post,Req} from '@nestjs/common';
import {Roles} from '../auth/roles.decorator';
import {Public} from '../auth/public.decorator';
import {SiteSettingsService} from './site-settings.service';
import type {AuthenticatedRequest} from '../auth/authenticated-request';
import { MediaService } from '../media/media.service';
import { RulesDocumentTargetDto } from './rules-document.dto';
import { parseDocxRules } from './docx-rules-parser';

@Controller('site-settings')
export class SiteSettingsController{
  constructor(private readonly service:SiteSettingsService, private readonly mediaService: MediaService){}
  @Roles('ADMIN') @Get() getAdmin(){return this.service.getAdmin();}
  @Roles('ADMIN') @Post('rules/preview') async previewRules(@Body() body: RulesDocumentTargetDto) {\n    const file = await this.mediaService.getSiteAssetBuffer(body.targetId);\n    try { return { success: true, targetId: body.targetId, blocks: parseDocxRules(file) }; }\n    catch (error) { throw new (await import('@nestjs/common')).BadRequestException(error instanceof Error ? error.message : 'Не удалось прочитать DOCX'); }\n  }\n  @Roles('ADMIN') @Patch() update(@Body() body:Record<string,unknown>,@Req() req:AuthenticatedRequest){return this.service.update(body,req.user.sub);}
  @Public() @Get('public') getPublic(){return this.service.getPublic();}
}
