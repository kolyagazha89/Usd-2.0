import { BadRequestException, Body, Controller, Delete, Get, Header, Headers, Param, Patch, Post, Req, StreamableFile } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import {VenueAutoSyncService} from './venue-auto-sync.service';
import { StagesService } from './stages.service';
import { VenueStageService } from './venue-stage.service';
import { VenueCertificateService } from './venue-certificate.service';
import { CreateStageDto, UpdateStageDto } from './dto/stage.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService,
 private readonly venueStageService: VenueStageService,
 private readonly venueAutoSyncService: VenueAutoSyncService,
 private readonly venueCertificateService: VenueCertificateService) {}

  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.stagesService.findAll();
  }

  @Public()
  @Get('public')
  findPublished() {
    return this.stagesService.findPublished();
  }

  @Public()
  @Get('public/:id')
  findPublishedOne(@Param('id') id: string) {
    return this.stagesService.findPublishedOne(id);
  }


  @Public()
  @Post('venue/sync')
  @Header('Cache-Control','no-store')
  venueSync(@Headers('authorization') token:string|undefined,@Body() body:unknown){
   return this.venueAutoSyncService.accept(token,body);
  }

  @Roles('ADMIN')
  @Get('venue/setup')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  venueSetup(@Req() request:AuthenticatedRequest){
    return this.venueStageService.getSetup(request);
  }

  /** Online ADMIN publishes ONLY the public Caddy CA exported by the offline laptop. */
  @Roles('ADMIN')
  @Get('venue/certificate')
  @Header('Cache-Control','private, no-store, max-age=0')
  certificateMetadata(@Req() request:AuthenticatedRequest){
    return this.venueCertificateService.metadata(request);
  }

  @Roles('ADMIN')
  @Post('venue/certificate')
  @Header('Cache-Control','private, no-store, max-age=0')
  publishVenueCertificate(@Body() body:unknown,@Req() request:AuthenticatedRequest){
    return this.venueCertificateService.publish(body,request);
  }

  /** The public root is not sensitive. Phone downloads must work without logging in. */
  @Public()
  @Get('venue/certificate/download/:format')
  @Header('Cache-Control','no-store, max-age=0')
  @Header('X-Content-Type-Options','nosniff')
  async downloadVenueCertificate(@Param('format') format:string){
    if(format!=='cer'&&format!=='crt')throw new BadRequestException('Допустимы только cer и crt');
    const cert=await this.venueCertificateService.download(format);
    return new StreamableFile(cert.data,{type:cert.contentType,
     disposition:'attachment; filename="'+cert.filename+'"'});
  }

  /**
   * A centrally signed, stage-only preparation snapshot for the venue laptop.
   * Includes first/last names, car plates and configuration snapshots;
   * therefore never cache it or expose it to judges/public API users.
   * This is NOT a central sync or an import into the venue DB.
   */
  @Roles('ADMIN')
  @Post('venue/:id/staff-export')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  exportVenueStageWithStaff(@Param('id') id:string,@Req() request:AuthenticatedRequest){
    return this.venueStageService.exportStage(id,request,true);
  }

  @Roles('ADMIN')
  @Get('venue/:id/export')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  exportVenueStage(@Param('id') id:string,@Req() request:AuthenticatedRequest){
    return this.venueStageService.exportStage(id,request);
  }

  @Roles('ADMIN')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stagesService.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() body: CreateStageDto, @Req() request: AuthenticatedRequest) {
    return this.stagesService.create(body, request);
  }

  @Roles('ADMIN')
  @Post(':id/results-publication')
  setResultsPublication(
    @Param('id') id: string,
    @Body() body: { published?: boolean; confirmed?: boolean },
    @Req() request: AuthenticatedRequest,
  ) {
    if (typeof body.published !== 'boolean') {
      throw new BadRequestException('Поле published должно быть true или false');
    }
    return this.stagesService.setResultsPublication(
      id,
      body.published,
      body.confirmed === true,
      request,
    );
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateStageDto, @Req() request: AuthenticatedRequest) {
    return this.stagesService.update(id, body, request);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.stagesService.remove(id, request);
  }
}
