import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { GoogleService } from './google.service';
import { Public } from '../auth/public.decorator';

function requireAdmin(req: Request): { id: string } {
  const user = (req as any).user;
  if (!user || user.role !== 'ADMIN') {
    throw new UnauthorizedException('Требуются права администратора');
  }
  return user;
}

@Controller('google')
export class GoogleController {
  constructor(private readonly google: GoogleService) {}

  @Get('status')
  async status(@Req() req: Request) {
    requireAdmin(req);
    return { success: true, ...(await this.google.getStatus()) };
  }

  @Get('connect')
  async connect(@Req() req: Request) {
    const user = requireAdmin(req);
    return { success: true, authorizationUrl: await this.google.createAuthorizationUrl(user.id) };
  }

  @Public()
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    try {
      await this.google.completeAuthorization(code, state);
      return res.redirect(frontend + '/admin/import?google=connected');
    } catch {
      return res.redirect(frontend + '/admin/import?google=error');
    }
  }

  @Get('spreadsheets')
  async spreadsheets(@Req() req: Request) {
    requireAdmin(req);
    return { success: true, spreadsheets: await this.google.listSpreadsheets() };
  }

  @Get('spreadsheets/:spreadsheetId')
  async spreadsheet(@Req() req: Request, @Param('spreadsheetId') spreadsheetId: string) {
    requireAdmin(req);
    return { success: true, spreadsheet: await this.google.getSpreadsheet(spreadsheetId) };
  }

  @Get('spreadsheets/:spreadsheetId/values')
  async values(
    @Req() req: Request,
    @Param('spreadsheetId') spreadsheetId: string,
    @Query('sheet') sheet: string,
  ) {
    requireAdmin(req);
    if (!sheet) return { success: false, error: 'Не указан лист' };
    return { success: true, values: await this.google.getSheetValues(spreadsheetId, sheet) };
  }
}
