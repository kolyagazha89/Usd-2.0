import {jest} from '@jest/globals';
import {X509Certificate} from 'node:crypto';
import {ForbiddenException,NotFoundException,BadRequestException} from '@nestjs/common';
import {VenueCertificateService} from './venue-certificate.service';

const ROOT_CA="-----BEGIN CERTIFICATE-----\nMIIDVTCCAj2gAwIBAgIUJPze7R/vlS4/8dMaEiWNuO8wKtQwDQYJKoZIhvcNAQEL\nBQAwMjEYMBYGA1UEAwwPVVNEIFRlc3QgTEFOIENBMRYwFAYDVQQKDA1VU0QgVGVz\ndCBPbmx5MB4XDTI2MTExNTE2NTA0MVoXDTM2MTExMjE2NTA0MVowMjEYMBYGA1UE\nAwwPVVNEIFRlc3QgTEFOIENBMRYwFAYDVQQKDA1VU0QgVGVzdCBPbmx5MIIBIjAN\nBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAubSWOjWWyQ+Af4wOdt0xrvQwqOMU\nRYE7UKWy5PeXo00VMOPMAGOsdRgRyuckCcpeYg2xZHvL2FFx3YbcApgERDbPfYvm\nUe0rosVtzxff46AOpnhlgfRH+T9Vym8/HB699BLwIy9tnIPqLl47zliCuO1iCbX/\nKBLMsQmWwVdRT/x6IUugv1kBqA4lvSYvgJgeIRuUnUTpkPIhs8TjX6MIw+tQLshF\nvIYa6FWXFBqgsP+vl26XBx2b2PPDxOCpH2OBbHS4LMT5QB7AO0747/2+ey8AyrKN\nWhGWWSHP4x6vxnCuQf4roKuaRs4i8/Ff488ny6ZBsZXD0H+kwL1lZ24x9QIDAQAB\no2MwYTAdBgNVHQ4EFgQU2P2wrFafcA42jEbcxTfFzUg1PYIwHwYDVR0jBBgwFoAU\n2P2wrFafcA42jEbcxTfFzUg1PYIwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8E\nBAMCAQYwDQYJKoZIhvcNAQELBQADggEBADdCypzj04KTMNkYknypR8BoFWVSJa+Q\ng9wWOAFVid76PnxTbwaZ8Vz4UPUOGjLwcHUhtFecOb0KJztMqpXZuGVUwBKAUd0K\ndwI0yofcDy97WWS4aiF23TishgdLM9r6iLsqKwlFGNX/CfTO1FvWA3kMKrR3ZRT/\nkfrAEGZCkpcXR15g5fQTwlU6tIXfWzAPaVPcW9VRgkj2TlMOpSscg1PaI2mvck9m\nCskUTELQHFHGZROoIWtD0aGiR7M7tcN2wxowhk4kiNTVsj9tVi7ZNXXq7vvWb6Kl\nmymtoIWJbBXVlblBokMYAqNWyNlHojqgkHByb+mbOU9796RXnQwUOvQ=\n-----END CERTIFICATE-----\n";
const admin={user:{role:'ADMIN',sub:'usd-admin'}} as any;
const judge={user:{role:'PARTICIPANT',sub:'staff'}} as any;

describe('USD venue LAN trust certificate published from the actual laptop',()=>{
 const record:any={id:'venue',pem:ROOT_CA,
  sha256:new X509Certificate(ROOT_CA).fingerprint256.replace(/:/g,'').toLowerCase(),
  notAfter:new Date(new X509Certificate(ROOT_CA).validTo),updatedAt:new Date('2026-11-15T12:00:00Z')};
 const prisma:any={venueTlsCertificate:{
  findUnique:jest.fn(),upsert:jest.fn(),
 }};
 const service=new VenueCertificateService(prisma);
 beforeEach(()=>{
  jest.clearAllMocks();
  prisma.venueTlsCertificate.findUnique.mockResolvedValue(record);
  prisma.venueTlsCertificate.upsert.mockResolvedValue(record);
 });
 it('publishes only a valid self-signed CA from ADMIN and returns metadata, never a private key',async()=>{
  const info=await service.publish({pem:ROOT_CA},admin);
  expect(info).toMatchObject({available:true,sha256:record.sha256});
  expect(JSON.stringify(info)).not.toContain('BEGIN CERTIFICATE');
  expect(prisma.venueTlsCertificate.upsert).toHaveBeenCalledWith(expect.objectContaining({
   where:{id:'venue'},
   update:expect.objectContaining({sha256:record.sha256,pem:ROOT_CA}),
   create:expect.objectContaining({id:'venue',sha256:record.sha256}),
  }));
  await expect(service.publish({pem:ROOT_CA},judge)).rejects.toThrow(ForbiddenException);
 });
 it('rejects bogus, oversized, leaf and private key uploads without replacing published root',async()=>{
  for(const pem of ['', 'invalid', 'PRIVATE KEY', ROOT_CA+'-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----',ROOT_CA.repeat(15)]){
   await expect(service.publish({pem},admin)).rejects.toThrow(BadRequestException);
  }
  expect(prisma.venueTlsCertificate.upsert).not.toHaveBeenCalled();
 });
 it('reports no published certificate and offers public PEM and DER copies for mobile installation',async()=>{
  expect(await service.metadata(admin)).toMatchObject({available:true,sha256:record.sha256});
  await expect(service.metadata(judge)).rejects.toThrow(ForbiddenException);
  const crt=await service.download('crt');
  expect(crt.filename).toBe('USD-Venue-CA.crt');
  expect(crt.data.toString('utf8')).toBe(ROOT_CA);
  const cer=await service.download('cer');
  expect(cer.filename).toBe('USD-Venue-CA.cer');
  expect(cer.contentType).toBe('application/pkix-cert');
  expect(cer.data.equals(new X509Certificate(ROOT_CA).raw)).toBe(true);
  prisma.venueTlsCertificate.findUnique.mockResolvedValue(null);
  expect(await service.metadata(admin)).toEqual({available:false});
  await expect(service.download('crt')).rejects.toThrow(NotFoundException);
 });
});
