import { Body, Controller, Post, Req } from '@nestjs/common';
import { MediaService } from './media.service';
import { PrepareUploadDto, CompleteUploadDto } from './dto/prepare-upload.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

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

  @Post('complete')
  complete(@Req() request: AuthenticatedRequest, @Body() body: CompleteUploadDto) {
    return this.mediaService.complete(request.user.sub, request.user.role, body.uploadToken);
  }
}
