import { jest } from '@jest/globals';
import { MailService } from './mail.service';

describe('profile-link decision transactional account emails',()=>{
 it.each([
  ['APPROVED','AUTH_PROFILE_LINK_APPROVED','Профиль успешно привязан'],
  ['REJECTED','AUTH_PROFILE_LINK_REJECTED','Заявка на привязку профиля отклонена'],
 ] as const)('sends branded %s email and records acceptance without body or tokens',async(status,type,heading)=>{
  const create=jest.fn(async()=>({id:'mail-log'}));
  const mail=new MailService({emailNotificationLog:{create}} as any);
  const send=jest.spyOn(mail as any,'sendMessage').mockResolvedValue(undefined);
  await (mail as any).sendProfileLinkDecisionEmail('member@example.test',status);
  const message=send.mock.calls[0][0] as any;
  expect(send).toHaveBeenCalledTimes(1);
  expect(message.to).toBe('member@example.test');
  expect(message.subject).toContain(heading);
  expect(message.text).toContain('USD · ULTIMATE SOUND DESTRUCTION');
  expect(message.html).toContain('ULTIMATE SOUND DESTRUCTION');
  expect(message.text).toContain('/participant');
  expect(message.text).not.toContain('token=');
  expect(create).toHaveBeenCalledWith({data:expect.objectContaining({
   type,recipient:'member@example.test',status:'PROVIDER_ACCEPTED',attempts:1,
  })});
  const journal=JSON.stringify(create.mock.calls[0][0]);
  expect(journal).not.toContain(message.html);
  expect(journal).not.toContain(message.text);
 });

 it('records failed transport rather than pretending delivery',async()=>{
  const create=jest.fn(async()=>({id:'failed'}));
  const mail=new MailService({emailNotificationLog:{create}} as any);
  jest.spyOn(mail as any,'sendMessage').mockRejectedValue(new Error('synthetic transport failure'));
  await expect((mail as any).sendProfileLinkDecisionEmail('member@example.test','APPROVED')).rejects.toThrow('synthetic transport failure');
  expect(create).toHaveBeenCalledWith({data:expect.objectContaining({
   type:'AUTH_PROFILE_LINK_APPROVED',status:'FAILED',attempts:1,lastError:'MAIL_TRANSPORT_ERROR',
  })});
 });
});
