import {BadRequestException,Body,Controller,Get,NotFoundException,Param,Patch,Post,Req} from '@nestjs/common';
import {Roles} from '../auth/roles.decorator';
import {Public} from '../auth/public.decorator';
import {SiteSettingsService} from './site-settings.service';
import type {AuthenticatedRequest} from '../auth/authenticated-request';
import { MediaService } from '../media/media.service';
import { RulesDocumentTargetDto } from './rules-document.dto';
import { parseDocxRules } from './docx-rules-parser';
import { MediaTargetType } from '../generated/prisma/enums';

const PUBLIC_LEGAL_DOCUMENT_KEYS = new Set([
  'privacyPolicy', 'personalDataConsent', 'termsOfUse', 'cookiePolicy',
  'newsletterConsent', 'photoProfileConsent',
  'officialProtocolConsent',
]);
const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Controller('site-settings')
export class SiteSettingsController{
  constructor(private readonly service:SiteSettingsService, private readonly mediaService: MediaService){}
  @Roles('ADMIN') @Get() getAdmin(){return this.service.getAdmin();}
  @Roles('ADMIN') @Post('rules/preview') async previewRules(@Body() body: RulesDocumentTargetDto) {
    const file = await this.mediaService.getSiteAssetBuffer(body.targetId);
    try { return { success: true, targetId: body.targetId, blocks: parseDocxRules(file) }; }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Не удалось прочитать DOCX'); }
  }
  @Roles('ADMIN') @Post('component-brands/preview') previewBrandMerge(@Body() body:any){return this.service.previewBrandMerge(body);}
  @Roles('ADMIN') @Post('component-brands/merge') mergeBrands(@Body() body:any,@Req() req:AuthenticatedRequest){return this.service.mergeBrands(body,req.user.sub);}
  @Roles('ADMIN') @Patch() update(@Body() body:Record<string,unknown>,@Req() req:AuthenticatedRequest){return this.service.update(body,req.user.sub);}
  @Public() @Get('documents/:documentKey') async publicDocument(@Param('documentKey') documentKey: string) {
    if (!PUBLIC_LEGAL_DOCUMENT_KEYS.has(documentKey)) throw new NotFoundException('Документ не найден');
    // Read only from the filtered public settings, never from unapproved drafts.
    const { settings } = await this.service.getPublic();
    const document = settings.legal.documents?.[documentKey] as
      | { targetId?: string; fileName?: string }
      | undefined;
    if (settings.legal.legalApproved !== true || !document?.targetId ||
        !document.targetId.startsWith('legal-document-' + documentKey + '-')) {
      throw new NotFoundException('Документ не опубликован');
    }
    // The same checked media path enforces live approval/revocation again.
    const media = await this.mediaService.getPublicMediaFile(MediaTargetType.SITE_ASSET, document.targetId);
    if (media.contentType !== DOCX_CONTENT_TYPE) throw new BadRequestException('Файл документа недоступен');
    try {
      return { success: true, fileName: document.fileName || 'document.docx', blocks: parseDocxRules(media.body) };
    } catch {
      throw new BadRequestException('Не удалось прочитать документ Word');
    }
  }
  @Public() @Get('public') getPublic(){return this.service.getPublic();}
}
