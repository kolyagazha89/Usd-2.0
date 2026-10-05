import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { MediaService } from './media.service';
import { Public } from '../auth/public.decorator';
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
    );
  }

  @Public()
  @Get('public/:targetType/:targetId')
  publicView(@Param('targetType') targetType: MediaTargetType, @Param('targetId') targetId: string) {
    return this.mediaService.getSignedPublicMediaUrl(targetType, targetId);
  }

  @Post('complete')
  complete(@Req() request: AuthenticatedRequest, @Body() body: CompleteUploadDto) {
    return this.mediaService.complete(request.user.sub, request.user.role, body.uploadToken);
  }
}
