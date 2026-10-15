import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { Roles } from '../auth/roles.decorator';
import { ComponentCatalogRequestsService } from './component-catalog-requests.service';

@Controller('component-catalog-requests')
export class ComponentCatalogRequestsController {
  constructor(private readonly service: ComponentCatalogRequestsService) {}

  @Roles('PARTICIPANT')
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    const category = typeof body?.category === 'string' ? body.category.trim() : '';
    const brand = typeof body?.brand === 'string' ? body.brand.trim() : '';
    const model = typeof body?.model === 'string' ? body.model.trim() : '';
    const details = typeof body?.details === 'string' ? body.details.trim() : '';
    if (!category || !brand || !model) throw new BadRequestException('Укажите категорию, бренд и модель комплектующего');
    if (category.length > 60 || brand.length > 100 || model.length > 160 || details.length > 1000) {
      throw new BadRequestException('Проверьте длину полей запроса');
    }
    return this.service.create(request.user.sub, { category, brand, model, details: details || undefined });
  }

  @Roles('ADMIN')
  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.service.list(request);
  }

  @Roles('ADMIN')
  @Patch(':id/approve')
  approve(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: { adminNote?: string }) {
    return this.service.approve(id, request.user.sub, body?.adminNote);
  }

  @Roles('ADMIN')
  @Post(':id/retry-email')
  retryEmail(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.retryEmail(id, request.user.sub);
  }

  @Roles('ADMIN')
  @Patch(':id/reject')
  reject(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: { adminNote?: string }) {
    return this.service.reject(id, request.user.sub, body?.adminNote);
  }
}
