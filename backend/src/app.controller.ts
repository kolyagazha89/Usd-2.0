import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';
import { readReleaseInfo } from './release-info';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('release')
  @Header('Cache-Control', 'no-store')
  getRelease(): { revision: string } {
    return readReleaseInfo();
  }
}
