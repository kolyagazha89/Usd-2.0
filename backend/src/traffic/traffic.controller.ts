import {Body,Controller,Get,Headers,HttpCode,Post,Req} from '@nestjs/common';
import type {Request} from 'express';
import {Public} from '../auth/public.decorator';
import {Roles} from '../auth/roles.decorator';
import {TrafficService} from './traffic.service';

@Controller('traffic')
export class TrafficController{
 constructor(private readonly service:TrafficService){}
 @Public()
 @Post('view')
 @HttpCode(204)
 async record(@Body('path') path:unknown,@Headers('origin') origin:string,
  @Headers('user-agent') ua:string,@Req() request:Request){
  await this.service.record(path,ua,origin,request.ip);
 }
 @Get('summary')
 @Roles('ADMIN')
 summary(){
  return this.service.summary();
 }
}
