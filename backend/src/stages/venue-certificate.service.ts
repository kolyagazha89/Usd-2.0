import {BadRequestException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {X509Certificate} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';
import type {AuthenticatedRequest} from '../auth/authenticated-request';
import {venueCertificatePage} from './venue-certificate-page';

const CERT_ID='venue';
const CERT_PATTERN=/^-----BEGIN CERTIFICATE-----\s+([A-Za-z0-9+/=\r\n]+)-----END CERTIFICATE-----\s*$/;

type CertificateRow={pem:string;sha256:string;notAfter:Date;updatedAt:Date};

/**
 * Public Caddy root CA only: no private key, PFX or signing key is accepted.
 * Online USD cannot generate the private root of another offline laptop.
 * An ADMIN uploads the actual public root once after retrieving it locally.
 */
@Injectable()
export class VenueCertificateService {
 constructor(private readonly prisma:PrismaService){}
 private assertAdmin(request:AuthenticatedRequest){
  if(request?.user?.role!=='ADMIN')throw new ForbiddenException('Сертификатом площадки управляет только ADMIN');
 }
 private metadataOf(row:CertificateRow|null){
  return row?{available:true,sha256:row.sha256,notAfter:row.notAfter.toISOString(),updatedAt:row.updatedAt.toISOString()}:
   {available:false};
 }
 async metadata(request:AuthenticatedRequest){
  this.assertAdmin(request);
  return this.metadataOf(await this.prisma.venueTlsCertificate.findUnique({where:{id:CERT_ID}}));
 }
 async publish(body:unknown,request:AuthenticatedRequest){
  this.assertAdmin(request);
  const text=(body as {pem?:unknown}|null)?.pem;
  if(typeof text!=='string'||text.length<500||text.length>8192||!CERT_PATTERN.test(text)||
    /PRIVATE KEY|BEGIN (?:RSA|EC) /i.test(text))throw new BadRequestException('Нужен только публичный CA-сертификат USD-Venue-CA.crt с ноутбука');
  const pem=text.replace(/\r\n/g,'\n').trim()+'\n';
  let cert:X509Certificate;
  try{cert=new X509Certificate(pem)}catch{
   throw new BadRequestException('Файл не содержит корректный сертификат X.509');
  }
  const from=Date.parse(cert.validFrom),until=Date.parse(cert.validTo);
  if(!cert.ca||cert.subject!==cert.issuer||!cert.verify(cert.publicKey)||
    !Number.isFinite(from)||!Number.isFinite(until)||from>Date.now()||until<Date.now()+86400000){
   throw new BadRequestException('Нужен действующий самоподписанный корневой сертификат Caddy, не сертификат сайта');
  }
  const sha256=cert.fingerprint256.replace(/:/g,'').toLowerCase();
  const notAfter=new Date(until);
  const row=await this.prisma.venueTlsCertificate.upsert({
   where:{id:CERT_ID},
   create:{id:CERT_ID,pem,sha256,notAfter},
   update:{pem,sha256,notAfter},
  });
  return this.metadataOf(row);
 }
 private async currentCertificate(expectedSha?:string){
  const row=await this.prisma.venueTlsCertificate.findUnique({where:{id:CERT_ID}});
  if(!row)throw new NotFoundException('Сертификат локального сервера ещё не загружен администратором');
  if(new Date(row.notAfter).getTime()<=Date.now())throw new NotFoundException('Сертификат локального сервера истёк');
  if(expectedSha!==undefined&&expectedSha!==row.sha256)throw new BadRequestException('Сертификат ноутбука изменился. Получите новую ссылку у администратора USD.');
  return row;
 }
 async installationPage(expectedSha?:string){
  const row=await this.currentCertificate(expectedSha);
  return venueCertificatePage(row.sha256,new Date(row.notAfter));
 }
 async download(format:'crt'|'cer',expectedSha?:string){
  const row=await this.currentCertificate(expectedSha);
  if(format==='cer'){
   return {filename:'USD-Venue-CA.cer',contentType:'application/pkix-cert',
    data:new X509Certificate(row.pem).raw,sha256:row.sha256};
  }
  return {filename:'USD-Venue-CA.crt',contentType:'application/x-x509-ca-cert',
   data:Buffer.from(row.pem,'utf8'),sha256:row.sha256};
 }
}
