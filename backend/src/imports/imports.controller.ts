import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { ImportsService } from './imports.service';
import { Roles } from '../auth/roles.decorator';
import { PreviewImportDto, ResolveImportRowDto } from './dto/import.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('imports')
@Roles('ADMIN')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('historical/auto-commit')
  autoCommitHistorical(@Req() req: AuthenticatedRequest) {
    const suppliedSecret = req.headers['x-historical-import-secret'];
    const configuredSecret = process.env.AUTO_HISTORICAL_IMPORT_SECRET;

    // A missing environment secret must fail closed. Otherwise two undefined
    // values would compare equal and expose this write endpoint publicly.
    if (!configuredSecret || typeof suppliedSecret !== 'string') {
      throw new ForbiddenException('Historical import secret is invalid');
    }

    const suppliedBytes = Buffer.from(suppliedSecret, 'utf8');
    const configuredBytes = Buffer.from(configuredSecret, 'utf8');
    if (
      suppliedBytes.length !== configuredBytes.length ||
      !timingSafeEqual(suppliedBytes, configuredBytes)
    ) {
      throw new ForbiddenException('Historical import secret is invalid');
    }

    return this.importsService.autoCommitHistoricalImport(req);
  }

  @Post('historical/prepare')
  prepareHistoricalXlsx(@Req() req: AuthenticatedRequest) {
    return this.importsService.prepareHistoricalXlsxImport(req);
  }

  @Post('stage/preview')
  preview(
    @Body() body: PreviewImportDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.importsService.previewStage(body, req);
  }

  @Get(':id')
  getImportJob(@Param('id') id: string) {
    return this.importsService.getImportJob(id);
  }
  @Get(':id/check')
checkImport(@Param('id') id: string) {
  return this.importsService.checkImport(id);
}
  @Get(':importId/rows')
  getImportRows(
    @Param('importId') importId: string,
    @Query('status') status?: string,
  ) {
    return this.importsService.getImportRows(
      importId,
      status,
    );
  }
  @Get(':importId/rows/:rowId')
  getImportRow(
    @Param('importId') importId: string,
    @Param('rowId') rowId: string,
  ) {
    return this.importsService.getImportRow(importId, rowId);
  }
  @Patch(':importId/rows/:rowId/vibration')
  setImportVibration(
    @Param('importId') importId: string,
    @Param('rowId') rowId: string,
    @Body() body: { vibrationIsolation?: unknown },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.importsService.setImportVibration(importId, rowId, body?.vibrationIsolation, req);
  }

  @Patch(':importId/rows/:rowId/resolve')
  resolveImportRow(
    @Param('importId') importId: string,
    @Param('rowId') rowId: string,
    @Body() body: ResolveImportRowDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.importsService.resolveImportRow(
      importId,
      rowId,
      body.resolution,
      req,
    );
  }
  @Post(':importId/commit')
  commitImport(
    @Param('importId') importId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.importsService.commitImport(importId, req);
  }
}