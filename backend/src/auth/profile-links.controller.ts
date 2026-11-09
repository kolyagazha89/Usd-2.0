import {Body,Controller,Get,Param,Patch,Post,Query,Req} from '@nestjs/common';
import {IsIn,IsString,IsUUID,MaxLength,MinLength} from 'class-validator';
import type {AuthenticatedRequest} from './authenticated-request';
import {Roles} from './roles.decorator';
import {ProfileLinksService} from './profile-links.service';
import {ProfileMergeService} from './profile-merge.service';

class SubmitLinkDto {
 @IsUUID() participantId!:string;
 @IsString() @MinLength(12) @MaxLength(1000) note!:string;
}
class MergeProfilesDto {
 @IsUUID() sourceId!:string;
 @IsUUID() targetId!:string;
 @IsString() @MinLength(8) @MaxLength(8) confirmation!:string;
}
class ReviewLinkDto {
 @IsIn(['APPROVE','REJECT']) decision!:'APPROVE'|'REJECT';
}
@Controller('profile-links')
@Roles('PARTICIPANT')
export class ProfileLinksController {
 constructor(private readonly service:ProfileLinksService){}
 @Get('mine')
 mine(@Req() request:AuthenticatedRequest){return this.service.myRequests(request.user.sub)}
 @Post()
 submit(@Req() request:AuthenticatedRequest,@Body() body:SubmitLinkDto){
  return this.service.submit(request.user.sub,body.participantId,body.note);
 }
}
@Controller('admin/profile-links')
@Roles('ADMIN')
export class AdminProfileLinksController {
 constructor(private readonly service:ProfileLinksService,private readonly merges:ProfileMergeService){}
 @Get()
 list(@Query('status') status?:string){return this.service.adminList(status)}
 @Get('diagnostics')
 diagnose(@Query('userId') userId:string,@Query('participantId') participantId:string){
  return this.service.diagnoseSelfLink(userId,participantId);
 }
 @Post('duplicates/merge')
 mergeDuplicates(@Req() request:AuthenticatedRequest,@Body() body:MergeProfilesDto){
  return this.merges.merge(body.sourceId,body.targetId,request.user.sub,body.confirmation);
 }
 @Get('duplicates/preview')
 previewDuplicates(@Query('sourceId') sourceId:string,@Query('targetId') targetId:string){
  return this.service.previewDuplicates(sourceId,targetId);
 }
 @Patch(':requestId')
 review(@Req() request:AuthenticatedRequest,@Param('requestId') requestId:string,@Body() body:ReviewLinkDto){
  return this.service.review(requestId,request.user.sub,body.decision);
 }
}
