import { jest } from '@jest/globals';
import { MediaController } from './media.controller';
import { MediaTargetType } from '../generated/prisma/enums';

describe('team gallery HTTP cache boundary',()=>{
 it('never caches a photo that ADMIN may unpublish or remove',async()=>{
  const service:any={
   getPublicMediaFile:jest.fn<(...args:any[])=>Promise<any>>().mockResolvedValue({
    body:Buffer.from([0x89,0x50,0x4e,0x47]),contentType:'image/png',
   }),
  };
  const controller=new MediaController(service);
  const setHeader=jest.fn();const send=jest.fn();
  await controller.publicFile(MediaTargetType.SITE_ASSET,
   'team-post-00000000-0000-4000-8000-000000000112-00000000-0000-4000-8000-000000000113',
   {setHeader,send} as any);
  expect(setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
  expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options','nosniff');
  expect(send).toHaveBeenCalledTimes(1);
 });
});
