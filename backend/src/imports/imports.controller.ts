import { Body, Controller, Get, Param, Patch, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ImportsService } from './imports.service';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { PreviewImportDto, ResolveImportRowDto } from './dto/import.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('imports')
@Roles('ADMIN')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Public()
  @Post('historical/auto-commit')
  autoCommitHistorical(@Req() req: AuthenticatedRequest) {
    const configuredSecret = process.env.AUTO_HISTORICAL_IMPORT_SECRET;
    const suppliedSecret = req.headers['x-historical-import-secret'];
    // Never allow an unconfigured secret to authenticate an empty request.
    if (
      typeof configuredSecret !== 'string' ||
      configuredSecret.length < 32 ||
      typeof suppliedSecret !== 'string' ||
      suppliedSecret !== configuredSecret
    ) {
      throw new UnauthorizedException('Historical import secret is invalid');
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