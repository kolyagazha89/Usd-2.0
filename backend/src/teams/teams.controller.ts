import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { TeamsService } from './teams.service';
import {
  CreateTeamDto,
  MembershipDecisionDto,
  TeamPostDto,
  UpdateTeamDto,
} from './teams.dto';

@Controller('teams')
export class TeamsController {
  constructor(private readonly service: TeamsService) {}
  @Public()
  @Get('public')
  publicTeams() {
    return this.service.publicTeams();
  }
  @Roles('ADMIN')
  @Get('admin')
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedRequest) {
    return this.service.adminList(request);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Get('me')
  @Header('Cache-Control', 'no-store')
  mine(@Req() request: AuthenticatedRequest) {
    return this.service.mine(request);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Post('me/leave')
  leave(@Req() request: AuthenticatedRequest) {
    return this.service.leave(request);
  }
  @Roles('ADMIN')
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateTeamDto) {
    return this.service.createTeam(request, body);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Patch(':teamId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Body() body: UpdateTeamDto,
  ) {
    return this.service.updateTeam(request, teamId, body);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Post(':teamId/join')
  join(@Req() request: AuthenticatedRequest, @Param('teamId') teamId: string) {
    return this.service.requestMembership(request, teamId);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Patch(':teamId/memberships/:id')
  decide(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Param('id') id: string,
    @Body() body: MembershipDecisionDto,
  ) {
    return this.service.decideMembership(request, teamId, id, body);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Post(':teamId/posts')
  createPost(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Body() body: TeamPostDto,
  ) {
    return this.service.savePost(request, teamId, body);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Patch(':teamId/posts/:id')
  updatePost(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Param('id') id: string,
    @Body() body: TeamPostDto,
  ) {
    return this.service.savePost(request, teamId, body, id);
  }
}
