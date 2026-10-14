import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MediaService } from './media.service';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { PrepareUploadDto, CompleteUploadDto } from './dto/prepare-upload.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { MediaTargetType } from '../generated/prisma/enums';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('prepare')
  prepare(@Req() request: AuthenticatedRequest, @Body() body: PrepareUploadDto) {
    return this.mediaService.prepare(
      request.user.sub,
      request.user.role,
      body.targetType,
      body.targetId,
      body.contentType,
      Boolean(request.user.customRoleId),
    );
  }

  @Get('view/:targetType/:targetId')
  view(
    @Req() request: AuthenticatedRequest,
    @Param('targetType') targetType: MediaTargetType,
    @Param('targetId') targetId: string,
  ) {
    return this.mediaService.getSignedViewUrl(
      request.user.sub,
      request.user.role,
      targetType,
      targetId,
      Boolean(request.user.customRoleId),
    );
  }

  @Public()
  @Get('public/:targetType/:targetId')
  publicView(@Param('targetType') targetType: MediaTargetType, @Param('targetId') targetId: string) {
    return this.mediaService.getSignedPublicMediaUrl(targetType, targetId);
  }

  @Public()
  @Get('public-file/:targetType/:targetId')
  async publicFile(
    @Param('targetType') targetType: MediaTargetType,
    @Param('targetId') targetId: string,
    @Res() response: Response,
  ) {
    const media = await this.mediaService.getPublicMediaFile(targetType, targetId);
    response.setHeader('Content-Type', media.contentType);
    if (media.contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      response.setHeader('Content-Disposition', 'attachment; filename="reglament-usd.docx"');
    }
    response.setHeader('Content-Length', String(media.body.length));
    response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    response.send(media.body);
  }

  @Roles('ADMIN')
  @Get('library')
  listMediaLibrary(@Req() request: AuthenticatedRequest) {
    return this.mediaService.listMediaLibrary(request.user.role, Boolean(request.user.customRoleId));
  }

  @Roles('ADMIN')
  @Delete('library/:targetType/:targetId')
  deleteMediaAsset(
    @Req() request: AuthenticatedRequest,
    @Param('targetType') targetType: MediaTargetType,
    @Param('targetId') targetId: string,
  ) {
    return this.mediaService.deleteMediaAsset(request.user.sub, request.user.role, targetType, targetId, Boolean(request.user.customRoleId));
  }

  @Put('upload')
  uploadThroughApi(
    @Req() request: AuthenticatedRequest,
    @Headers('x-upload-token') uploadToken: string,
  ) {
    const contentType = String(request.headers['content-type'] ?? '').split(';')[0].toLowerCase();
    const body = request.body as Buffer;
    return this.mediaService.uploadThroughApi(
      request.user.sub,
      request.user.role,
      uploadToken,
      body,
      contentType,
      Boolean(request.user.customRoleId),
    );
  }

  @Post('complete')
  complete(@Req() request: AuthenticatedRequest, @Body() body: CompleteUploadDto) {
    return this.mediaService.complete(request.user.sub, request.user.role, body.uploadToken, Boolean(request.user.customRoleId));
  }
}
