import {
 BadRequestException,ConflictException,ForbiddenException,Injectable,Logger,
 ServiceUnavailableException,UnauthorizedException,
} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {finalizeVenueStage} from '../scripts/finalize-venue-return';
import pg from 'pg';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {VenueReturnReviewService} from './venue-return-review.service';

const returnConflictMessages={
 RESULTS_ALREADY_PUBLISHED:'Результаты этапа уже опубликованы. Администратор может скрыть результаты в карточке этапа и повторить отправку.',
 STAGE_UNAVAILABLE:'Этап на сайте недоступен. Проверьте его состояние в онлайн-админке USD.',
 JOURNAL_MISMATCH:'Сайт уже получил другой журнал этого этапа. Передайте резервную копию администратору USD для сверки.',
 PARTICIPANT_NOT_ELIGIBLE:'Один из участников не допущен к этапу на сайте. Нужна проверка администратора USD.',
 CLASS_UNAVAILABLE:'Один из классов больше не доступен на этапе. Проверьте классы в онлайн-админке USD.',
 RESULT_ADMISSION_MISSING:'Для одного из результатов сайт не подтвердил инспекцию или допуск к классу.',
 START_NUMBER_TAKEN:'Стартовый номер из локального журнала уже занят на сайте. Администратору нужно сверить регистрации и номера.',
 CAR_REGISTRATION_EXISTS:'Автомобиль из локальной заявки уже зарегистрирован на этот этап на сайте. Нужна сверка заявок администратором USD.',
 RETURN_ROW_ALREADY_EXISTS:'Запись из журнала пересекается с другой записью на сайте. Требуется сверка администратором USD.',
 RETURN_REFERENCE_MISSING:'На сайте не найдена связанная запись журнала. Требуется сверка этапа администратором USD.',
};
const returnFailureMessages={
 RETURN_DB_UNAVAILABLE:'Центральная база недоступна. Повторите отправку позже.',
 RETURN_WRITE_FAILED:'Сайт не подтвердил запись журнала в базу. Повторите отправку позже.',
 RETURN_DB_BUSY:'База занята другой операцией. Журнал не подтверждён. Повторите отправку позже.',
 RETURN_DB_SCHEMA:'Структура центральной базы не соответствует журналу. Обратитесь к администратору USD.',
 RETURN_DB_PERMISSIONS:'Сайт не смог записать данные из-за настроек доступа к базе. Обратитесь к администратору USD.',
 RETURN_ROW_INVALID:'База не приняла формат записи журнала. Передайте технические подробности администратору USD.',
 RETURN_RECEIPT_MISMATCH:'Сайт не подтвердил приём всех операций. Требуется проверка журнала на основном сервере.',
 RETURN_FINALIZE_FAILED:'Журнал записан. Сайт не подтвердил пересчёт результатов. Повторите отправку того же журнала.',
 RETURN_ACK_FAILED:'Журнал записан и результаты пересчитаны. Повторите отправку для получения подтверждения.',
};

function errorCode(error:unknown){
 return error instanceof Error&&'code' in error&&typeof error.code==='string'?error.code:undefined;
}

const retryableTransactionCodes=new Set(['40001','40P01','55P03']);

export async function retryVenueTransaction<T>(apply:()=>Promise<T>):Promise<T>{
 // PostgreSQL aborts these transactions. A complete retry recreates all reads
 // and writes against a fresh snapshot, including the receipt and audits.
 for(const backoff of [75,250]){
  try{return await apply()}
  catch(error){if(!retryableTransactionCodes.has(errorCode(error)??''))throw error}
  await delay(backoff);
 }
 return apply();
}

export function databaseWriteFailure(error:unknown):keyof typeof returnFailureMessages{
 const code=errorCode(error);
 if(!code)return 'RETURN_WRITE_FAILED';
 if(retryableTransactionCodes.has(code)||code==='57014')return 'RETURN_DB_BUSY';
 if(['42P01','42703','42804','RETURN_SCHEMA_MISMATCH'].includes(code))return 'RETURN_DB_SCHEMA';
 if(['42501','25006'].includes(code))return 'RETURN_DB_PERMISSIONS';
 if(code==='23502'||code==='23514'||code.startsWith('22'))return 'RETURN_ROW_INVALID';
 return 'RETURN_WRITE_FAILED';
}

export function databaseRegistrationConflict(error:unknown){
 if(!(error instanceof Error)||!('code' in error)||error.code!=='23505'||!('constraint' in error))return;
 switch(error.constraint){
  case 'Registration_stageId_participantNumber_key':
  case 'RegistrationNumber_stageId_number_key':return 'START_NUMBER_TAKEN';
  case 'Registration_stageId_carId_key':return 'CAR_REGISTRATION_EXISTS';
 }
}

/** Device authentication uses a per-stage ADMIN-signed capability; no central
 * database credentials or user session are copied to the offline laptop. */
@Injectable()
export class VenueAutoSyncService {
 private readonly logger=new Logger(VenueAutoSyncService.name);
 constructor(private readonly prisma:PrismaService,private readonly reviews:VenueReturnReviewService){}

 private failed(code:keyof typeof returnFailureMessages,error?:unknown,reference?:string):never{
  const rawCode=errorCode(error);
  const databaseCode=typeof rawCode==='string'&&/^[A-Z0-9]{5}$/.test(rawCode)?rawCode:undefined;
  const eventSequence=error instanceof Error&&'venueSequence' in error&&typeof error.venueSequence==='number'
   &&Number.isSafeInteger(error.venueSequence)&&error.venueSequence>0?error.venueSequence:undefined;
  this.logger.warn([code,reference,databaseCode,eventSequence].filter(Boolean).join(' '));
  throw new ServiceUnavailableException({code,message:returnFailureMessages[code],
   ...(databaseCode?{databaseCode}:{}),...(reference?{reference}:{}),...(eventSequence?{eventSequence}:{})});
 }
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
  if(!url)return this.failed('RETURN_DB_UNAVAILABLE');
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
  // This digest binds approvals to immutable journal events, not randomized
  // AES-GCM envelopes. Re-export/re-encryption preserves the reviewed identity.
  // Another stage/device/event stream cannot borrow these decisions.
  const journalContentHash=createHash('sha256').update(JSON.stringify(snapshot.events)).digest('hex');
  const reference=journalContentHash.slice(0,12);
  const approval=await this.reviews.matched(grant.id,snapshot.journalEndHash,journalContentHash);
  const client=new pg.Client({connectionString:url,application_name:'usd_venue_return'});
  let connected=false;
  let report:any;
  try{
   await client.connect();
   connected=true;
   const database=(await client.query('SELECT current_database() AS db')).rows[0]?.db;
   if(/^usd_venue(?:_|$)/.test(database??''))throw new Error('Not central DB');
   const adapter=postgresFullVenueAdapter(client);
   report=await retryVenueTransaction(()=>applyCompleteVenueJournal(snapshot,adapter,{
    apply:true,stageId:body.stageId,baselineSha256:trusted.baselineSha256,
    baselineIssuedAt:grant.createdAt,
    operator:'VENUE_AUTO:'+grant.id,
    ...approval,
   }));
  }catch(error){
   if(!connected)this.failed('RETURN_DB_UNAVAILABLE',error,reference);
   if(error instanceof Error&&/MANUAL_REVIEW|DUPLICATE_CAR_PLATE|DUPLICATE_PARTICIPANT_NAME/.test(error.message)){
    const conflicts=await this.reviews.preview(snapshot);
    if(conflicts.length){
     const pending=await this.reviews.pending(grant.id,body.stageId as string,
      snapshot.journalEndHash,journalContentHash,conflicts);
     throw new ConflictException({code:'RETURN_REVIEW_PENDING',reviewId:pending.id,
      message:'Требуется решение администратора в разделе «Офлайн-сервер».'});
    }
    throw new ConflictException({code:'RETURN_REVIEW_REQUIRED',
     message:'Нужна ручная сверка журнала администратором USD. Локальный пакет сохранён.'});
   }
   const rawCode=errorCode(error);
   const code=databaseRegistrationConflict(error)??
    (rawCode==='23505'?'RETURN_ROW_ALREADY_EXISTS':rawCode==='23503'?'RETURN_REFERENCE_MISSING':rawCode);
   if(typeof code==='string'&&Object.hasOwn(returnConflictMessages,code))
    throw new ConflictException({code,message:returnConflictMessages[code as keyof typeof returnConflictMessages]});
   if(error instanceof Error&&/CONFLICT|central changed|number.*owner/i.test(error.message))
    throw new ConflictException({code:'RETURN_CONFLICT',message:'Конфликт центральных данных. Все локальные результаты сохранены.'});
   this.failed(databaseWriteFailure(error),error,reference);
  }finally{await client.end().catch(()=>undefined)}
  // A future adapter must not accidentally acknowledge a partial import.
  // This is checked *before* any derived state is marked ready.
  try{
   auth.assertCompleteReturn(report,body.stageId,snapshot.journalEndHash,snapshot.events.length);
  }catch(error){this.failed('RETURN_RECEIPT_MISMATCH',error,reference)}
  // Replay-safe: when this step fails, the same signed journal retries without
  // inserting duplicate results; no ACK until rankings and records rebuild.
  try{
   const derived=await finalizeVenueStage(body.stageId,url);
   if(!derived.recalculated&&derived.resultCount!==0)throw new Error('Not finalized');
  }catch(error){this.failed('RETURN_FINALIZE_FAILED',error,reference)}
  try{
   if(approval.reviewId)await this.reviews.applied(approval.reviewId);
   await this.prisma.venueSyncAuthorization.updateMany({
    where:{id:grant.id,acceptedAt:null},data:{lastJournalHash:report.journalEndHash,acceptedAt:new Date()},
   });
  }catch(error){this.failed('RETURN_ACK_FAILED',error,reference)}
  return {accepted:true,databaseSynchronized:true,derivedRankingsRebuilt:true,
   stageId:body.stageId,journalEndHash:report.journalEndHash,totalEvents:report.totalEvents,
   mediaTransferRequired:false};
 }
}
