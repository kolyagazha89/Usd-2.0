import {
 BadRequestException,ConflictException,ForbiddenException,Injectable,
 ServiceUnavailableException,UnauthorizedException,
} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {finalizeVenueStage} from '../scripts/finalize-venue-return';
import pg from 'pg';

/** Device authentication uses a per-stage ADMIN-signed capability; no central
 * database credentials or user session are copied to the offline laptop. */
@Injectable()
export class VenueAutoSyncService {
 constructor(private readonly prisma:PrismaService){}
 async accept(header:string|undefined,input:unknown){
  if(process.env.USD_VENUE_LAN_MODE==='true')throw new ForbiddenException('Недопустимо на площадке');
  const match=/^Venue ([A-Za-z0-9_-]{43})$/.exec(header??'');
  if(!match)throw new UnauthorizedException('Площадка не авторизована');
  const body=input as Record<string,unknown>;
  if(!body||typeof body!=='object'||Array.isArray(body)
   ||Object.keys(body).length!==3||!Object.hasOwn(body,'stageId')
   ||!Object.hasOwn(body,'publicKeyPem')||!Object.hasOwn(body,'envelope')
   ||typeof body.stageId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.stageId)
   ||typeof body.publicKeyPem!=='string'||body.publicKeyPem.length>4096)
   throw new BadRequestException('Неверный формат защищённого пакета');
  const auth=await import('../../scripts/venue-sync/authority.mjs');
  const {openVenueReturn}=await import('../../scripts/venue-sync/venue-return-package.mjs');
  const {applyCompleteVenueJournal}=await import('../../scripts/venue-sync/full-return-apply.mjs');
  const {postgresFullVenueAdapter}=await import('../../scripts/venue-sync/venue-full-adapter.mjs');
  const token=match[1];
  const grant=await this.prisma.venueSyncAuthorization.findUnique({
   where:{tokenHash:auth.tokenHash(token)},
  });
  if(!grant)throw new UnauthorizedException('Доступ площадки не найден');
  let trusted:{fingerprint:string;baselineSha256:string};
  try{trusted=auth.checkAuthority(grant,token,body.publicKeyPem,body.stageId)}
  catch{throw new UnauthorizedException('Доступ отозван или подпись ноутбука отличается')}
  const url=process.env.DATABASE_URL;
  if(!url)throw new ServiceUnavailableException('Центральная база недоступна');
  let snapshot:any;
  try{
   snapshot=openVenueReturn(body.envelope,auth.derivedPassphrase(token),body.publicKeyPem,{
    stageId:body.stageId,baselineSha256:trusted.baselineSha256,
    trustedFingerprint:trusted.fingerprint,now:Date.now(),
   });
  }catch{throw new BadRequestException('Подпись или целостность журнала не подтверждены')}
  // Pair first Ed25519 key on successful signature verification. Other laptops
  // cannot silently replace it, even when a copy of the stage file leaks.
  const pin=await this.prisma.venueSyncAuthorization.updateMany({
   where:{id:grant.id,revokedAt:null,
    OR:[{venueFingerprint:null},{venueFingerprint:trusted.fingerprint}]},
   data:{venueFingerprint:trusted.fingerprint,venuePublicKeyPem:body.publicKeyPem},
  });
  if(pin.count!==1)throw new UnauthorizedException('Устройство отвязано');
  const client=new pg.Client({connectionString:url,application_name:'usd_venue_return'});
  let report:any;
  try{
   await client.connect();
   const database=(await client.query('SELECT current_database() AS db')).rows[0]?.db;
   if(/^usd_venue(?:_|$)/.test(database??''))throw new Error('Not central DB');
   report=await applyCompleteVenueJournal(snapshot,postgresFullVenueAdapter(client),{
    apply:true,stageId:body.stageId,baselineSha256:trusted.baselineSha256,
    operator:'VENUE_AUTO:'+grant.id,
   });
  }catch(error){
   if(error instanceof Error&&/CONFLICT|central changed|number.*owner/i.test(error.message))
    throw new ConflictException('Конфликт центральных данных. Все локальные результаты сохранены.');
   throw new ServiceUnavailableException('Безопасный импорт не завершён; повторите попытку');
  }finally{await client.end().catch(()=>undefined)}
  // A future adapter must not accidentally acknowledge a partial import.
  // This is checked *before* any derived state is marked ready.
  try{
   auth.assertCompleteReturn(report,body.stageId,snapshot.journalEndHash,snapshot.events.length);
  }catch{throw new ServiceUnavailableException('Неполная сверка журнала; локальные данные сохранены')}
  // Replay-safe: when this step fails, the same signed journal retries without
  // inserting duplicate results; no ACK until rankings and records rebuild.
  try{
   const derived=await finalizeVenueStage(body.stageId,url);
   if(!derived.recalculated&&derived.resultCount!==0)throw new Error('Not finalized');
  }catch{throw new ServiceUnavailableException('База сохранена, пересчёт не подтверждён; повторите синхронизацию')}
  await this.prisma.venueSyncAuthorization.update({
   where:{id:grant.id},data:{lastJournalHash:report.journalEndHash,acceptedAt:new Date()},
  });
  return {accepted:true,databaseSynchronized:true,derivedRankingsRebuilt:true,
   stageId:body.stageId,journalEndHash:report.journalEndHash,totalEvents:report.totalEvents,
   mediaTransferRequired:false};
 }
}
