import {Body,Controller,Get,Param,ParseUUIDPipe,Patch,Query,Req,UseInterceptors} from '@nestjs/common';
import {IsIn,IsUUID,IsOptional} from 'class-validator';
import {Roles} from '../auth/roles.decorator';
import type {AuthenticatedRequest} from '../auth/authenticated-request';
import {NoStoreInterceptor} from '../push/push.no-store';
import {AdminNotificationsService} from './admin-notifications.service';
class InboxQuery {
 @IsOptional() @IsIn(['all','unread','read','done']) status?:'all'|'unread'|'read'|'done';
 @IsOptional() @IsUUID() cursor?:string;
}
class InboxUpdate {@IsIn(['READ','DONE']) status!:'READ'|'DONE'}
@Controller('admin/inbox')
@Roles('ADMIN')
@UseInterceptors(NoStoreInterceptor)
export class AdminNotificationsController {
 constructor(private readonly service:AdminNotificationsService){}
 @Get('summary') summary(@Req() req:AuthenticatedRequest){return this.service.summary(req.user.sub)}
 @Get() list(@Req() req:AuthenticatedRequest,@Query() query:InboxQuery){return this.service.list(req.user.sub,query.status,query.cursor)}
 @Patch(':id') update(@Req() req:AuthenticatedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:InboxUpdate){return this.service.update(req.user.sub,id,body.status)}
}
