import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { AdminDeletionService } from './admin-deletion.service';

export class PermanentDeleteDto {
  @IsString() @MaxLength(300) confirmation!: string;
  @IsString() @MaxLength(64) fingerprint!: string;
}
@Controller('admin/permanent-deletion')
@Roles('ADMIN')
export class AdminDeletionController {
  constructor(private readonly service: AdminDeletionService) {}
  @Get(':kind/:id')
  preview(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.preview(kind, id, request);
  }
  @Post(':kind/:id')
  remove(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: PermanentDeleteDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.remove(kind, id, body, request);
  }
}
