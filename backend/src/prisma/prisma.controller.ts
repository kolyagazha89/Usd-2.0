import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from './prisma.service';

@Controller('prisma')
export class PrismaController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('ADMIN')
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      success: true,
      database: 'connected',
    };
  }
}