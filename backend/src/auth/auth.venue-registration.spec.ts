import {jest} from '@jest/globals';
import {AuthService} from './auth.service';

describe('Venue hub does not create disconnected public accounts',()=>{
 const previous=process.env.USD_VENUE_LAN_MODE;
 afterEach(()=>{
  if(previous===undefined)delete process.env.USD_VENUE_LAN_MODE;
  else process.env.USD_VENUE_LAN_MODE=previous;
 });
 it('refuses unauthenticated public signup before reading policies or touching the DB',async()=>{
  process.env.USD_VENUE_LAN_MODE='true';
  const prisma:any={user:{findUnique:jest.fn(),create:jest.fn()},siteSettings:{findUnique:jest.fn()}};
  const mail:any={sendVerificationEmail:jest.fn()};
  const service=new AuthService(prisma,{} as any,mail);
  await expect(service.register('person@example.com','validpassword123',true,true,false))
   .rejects.toThrow('Регистрация аккаунтов на локальном сервере недоступна');
  expect(prisma.user.create).not.toHaveBeenCalled();
  expect(prisma.siteSettings.findUnique).not.toHaveBeenCalled();
  expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
 });
});
