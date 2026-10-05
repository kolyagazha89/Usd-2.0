import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { AssistantService } from './assistant.service';

@Controller('assistant')
@Roles('ADMIN')
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  @Get('requests')
  list() {
    return this.service.list();
  }

  @Post('requests')
  create(@Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest) {
    return this.service.create(body, req.user.sub);
  }

  @Patch('requests/:id/submit')
  submit(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.submit(id, req.user.sub);
  }

  @Patch('requests/:id/approve')
  approve(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest) {
    return this.service.approve(id, body, req.user.sub);
  }

  @Patch('requests/:id/reject')
  reject(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.reject(id, req.user.sub);
  }
}
