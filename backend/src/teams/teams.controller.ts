import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Query,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { TeamManagementService } from './team-management.service';
import { TeamsService } from './teams.service';
import {
  CreateTeamDto,
  TeamManagementModeDto,
  SelectTeamDto,
  MembershipDecisionDto,
  TeamPostDto,
  TeamPostReviewDto,
  UpdateTeamDto,
} from './teams.dto';

@Controller('teams')
export class TeamsController {
  constructor(
    private readonly service: TeamsService,
    private readonly management: TeamManagementService,
  ) {}
  @Public()
  @Get('mode')
  @Header('Cache-Control', 'no-store')
  mode() {
    return this.management.mode();
  }
  @Roles('ADMIN')
  @Patch('mode')
  setMode(
    @Req() request: AuthenticatedRequest,
    @Body() body: TeamManagementModeDto,
  ) {
    return this.management.setMode(request, body.fullManagement);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Get('options')
  @Header('Cache-Control', 'no-store')
  options(@Req() request: AuthenticatedRequest) {
    return this.management.options(request);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Get('me/selection')
  @Header('Cache-Control', 'no-store')
  selection(@Req() request: AuthenticatedRequest) {
    return this.management.selection(request);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Patch('me/selection')
  select(@Req() request: AuthenticatedRequest, @Body() body: SelectTeamDto) {
    return this.management.select(request, body.name);
  }
  @Public()
  @Get('public')
  @Header('Cache-Control', 'no-store')
  async publicTeams() {
    const teams = await this.service.publicTeams();
    return (await this.management.mode()).fullManagement
      ? teams
      : teams.map((team) => ({ ...team, posts: [] }));
  }
  @Public()
  @Get('public/standings')
  publicStandings(
    @Query('stageId') stageId?: string,
    @Query('seasonId') seasonId?: string,
    @Query('direction') direction?: string,
  ) {
    return this.service.publicStandings({ stageId, seasonId, direction });
  }
  @Public()
  @Get('public/:teamId/achievements')
  publicStageAchievements(@Param('teamId') teamId: string) {
    return this.service.publicStageAchievements(teamId);
  }
  @Public()
  @Get('public/:teamId/inspected-achievements')
  inspectedAchievements(@Param('teamId') teamId: string) {
    return this.service.publicInspectedStageAchievements(teamId);
  }
  @Roles('ADMIN')
  @Get('admin')
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: AuthenticatedRequest) {
    const data = await this.service.adminList(request);
    const { fullManagement } = await this.management.mode();
    return {
      ...data,
      fullManagement,
      users: fullManagement ? data.users : [],
      teams: fullManagement
        ? data.teams
        : data.teams.map((team) => ({
            ...team,
            commander: null,
            commanderUserId: null,
            posts: [],
          })),
    };
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Get('me')
  @Header('Cache-Control', 'no-store')
  async mine(@Req() request: AuthenticatedRequest) {
    const mine = await this.service.mine(request);
    return (await this.management.mode()).fullManagement
      ? mine
      : { ...mine, commandedTeam: null };
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Post('me/leave')
  async leave(@Req() request: AuthenticatedRequest) {
    await this.management.requireFull();
    return this.service.leave(request);
  }
  @Roles('ADMIN')
  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateTeamDto,
  ) {
    if (body.commanderUserId !== undefined || body.description !== undefined)
      await this.management.requireFull();
    return this.service.createTeam(request, body);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Patch(':teamId')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Body() body: UpdateTeamDto,
  ) {
    if (
      request.user.role !== 'ADMIN' ||
      body.commanderUserId !== undefined ||
      body.description !== undefined
    )
      await this.management.requireFull();
    return this.service.updateTeam(request, teamId, body);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Post(':teamId/join')
  async join(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
  ) {
    await this.management.requireFull();
    return this.service.requestMembership(request, teamId);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Patch(':teamId/memberships/:id')
  async decide(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Param('id') id: string,
    @Body() body: MembershipDecisionDto,
  ) {
    await this.management.requireFull();
    return this.service.decideMembership(request, teamId, id, body);
  }
  @Roles('ADMIN')
  @Post(':teamId/posts/:id/approve')
  async approvePost(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Param('id') id: string,
    @Body() body: TeamPostReviewDto,
  ) {
    await this.management.requireFull();
    return this.service.approvePost(request, teamId, id, body.reviewedAt);
  }

  @Roles('ADMIN')
  @Post(':teamId/posts/:id/return')
  async returnPost(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Param('id') id: string,
    @Body() body: TeamPostReviewDto,
  ) {
    await this.management.requireFull();
    return this.service.returnPostToDraft(request, teamId, id, body.reviewedAt);
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Post(':teamId/posts')
  async createPost(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Body() body: TeamPostDto,
  ) {
    await this.management.requireFull();
    return this.service.savePost(request, teamId, body);
  }
  @Roles('ADMIN', 'PARTICIPANT')
  @Patch(':teamId/posts/:id')
  async updatePost(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Param('id') id: string,
    @Body() body: TeamPostDto,
  ) {
    await this.management.requireFull();
    return this.service.savePost(request, teamId, body, id);
  }
}
