import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ImportsService } from './imports.service';
import { Roles } from '../auth/roles.decorator';
import { PreviewImportDto, ResolveImportRowDto } from './dto/import.dto';

@Controller('imports')
@Roles('ADMIN')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('stage/preview')
  preview(
    @Body() body: PreviewImportDto,
  ) {
    return this.importsService.previewStage(body);
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
) {
  return this.importsService.resolveImportRow(
    importId,
    rowId,
    body.resolution,
  );
}
@Post(':importId/commit')
commitImport(@Param('importId') importId: string) {
  return this.importsService.commitImport(importId);
}
}