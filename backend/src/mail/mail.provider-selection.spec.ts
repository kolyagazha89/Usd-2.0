import {jest} from '@jest/globals';
import {MailService} from './mail.service';

describe('USD mail provider selection and safe diagnostics',()=>{
 const keys=['MAIL_PROVIDER','RESEND_API_KEY','RESEND_FROM_EMAIL','GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','GMAIL_SENDER_EMAIL','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SMTP_EGRESS_ALLOWED','SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'];
 const prior:Record<string,string|undefined>={};
 beforeEach(()=>{
   for(const key of keys){prior[key]=process.env[key];delete process.env[key]}
 });
 afterEach(()=>{
   for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key]}
   jest.restoreAllMocks();
 });
 it('does not mistake Google login OAuth client for Gmail mail transport',async()=>{
  process.env.GOOGLE_CLIENT_ID='web-login-client';process.env.GOOGLE_CLIENT_SECRET='web-login-secret';
  process.env.SMTP_EGRESS_ALLOWED='true';process.env.SMTP_HOST='smtp.test.invalid';
  process.env.SMTP_USER='sender@test.invalid';process.env.SMTP_PASSWORD='fake_password';
  const mail=new MailService();
  const smtp=jest.spyOn((mail as any).transporter,'sendMail').mockResolvedValue({accepted:['recipient@test.invalid'],rejected:[],messageId:'fixture'} as never);
  const gmail=jest.spyOn(mail as any,'sendViaGmailApi');
  const status=mail.getDeliveryStatus();
  expect(status.provider).toBe('SMTP');
  expect(status.ready).toBe(true);
  await (mail as any).sendMessage({to:'recipient@test.invalid',subject:'test',html:'<p>test</p>',text:'test'});
  expect(smtp).toHaveBeenCalledTimes(1);expect(gmail).not.toHaveBeenCalled();
 });
 it('honors explicitly disabled SMTP rather than attempting a network request',async()=>{
   process.env.SMTP_EGRESS_ALLOWED='false';
   process.env.SMTP_HOST='smtp.test.invalid';process.env.SMTP_USER='sender@test.invalid';process.env.SMTP_PASSWORD='not-a-real-secret';
   const mail=new MailService();
   const smtp=jest.spyOn((mail as any).transporter,'sendMail');
   expect(mail.getDeliveryStatus().ready).toBe(false);
   await expect((mail as any).sendMessage({to:'r@test.invalid',subject:'test',text:'test',html:'test'})).rejects.toThrow('SMTP delivery requires SMTP_EGRESS_ALLOWED=true');
   expect(smtp).not.toHaveBeenCalled();
 });
 it('identifies incomplete Gmail mail configuration without exposing secret values',()=>{
   process.env.GMAIL_REFRESH_TOKEN='DO_NOT_LEAK_REFRESH_TOKEN';
   process.env.GOOGLE_CLIENT_ID='oauth-login';
   process.env.GOOGLE_CLIENT_SECRET='secret-from-login';
   const status=new MailService().getDeliveryStatus();
   expect(status.provider).toBe('Gmail API HTTPS');
   expect(status.ready).toBe(false);
   expect(status.missing).toContain('GMAIL_SENDER_EMAIL');
   expect(JSON.stringify(status)).not.toContain('DO_NOT_LEAK');
   expect(JSON.stringify(status)).not.toContain('secret-from-login');
 });
 it('reports missing Resend FROM and does not invent delivery confirmation',()=>{
   process.env.RESEND_API_KEY='secret-test';
   const status=new MailService().getDeliveryStatus();
   expect(status).toMatchObject({provider:'Resend HTTPS',ready:false});
   expect(status.missing).toContain('RESEND_FROM_EMAIL');
   expect(JSON.stringify(status)).not.toContain('secret-test');
 });
 it('chooses the personal Yandex SMTP mailbox even with complete legacy Gmail and Resend credentials',async()=>{
   process.env.MAIL_PROVIDER='smtp';
   process.env.RESEND_API_KEY='old-resend-secret';
   process.env.RESEND_FROM_EMAIL='old@resend.test';
   process.env.GMAIL_CLIENT_ID='old-gmail-client';
   process.env.GMAIL_CLIENT_SECRET='old-gmail-secret';
   process.env.GMAIL_REFRESH_TOKEN='old-gmail-refresh';
   process.env.GMAIL_SENDER_EMAIL='old@gmail.test';
   process.env.SMTP_EGRESS_ALLOWED='true';
   process.env.SMTP_HOST='smtp.yandex.com';
   process.env.SMTP_PORT='465';
   process.env.SMTP_USER='usd-russia';
   process.env.SMTP_PASSWORD='fake-yandex-app-password';
   process.env.SMTP_FROM='USD <usd-russia@yandex.com>';
   const mail=new MailService();
   const smtp=jest.spyOn((mail as any).transporter,'sendMail').mockResolvedValue({accepted:['recipient@test.invalid'],rejected:[],messageId:'yandex-test'} as never);
   const gmail=jest.spyOn(mail as any,'sendViaGmailApi');
   const status=mail.getDeliveryStatus();
   expect(status).toMatchObject({provider:'Яндекс Почта (SMTP)',ready:true,missing:[]});
   expect(JSON.stringify(status)).not.toContain('fake-yandex-app-password');
   expect((mail as any).transporter.options.secure).toBe(true);
   await (mail as any).sendMessage({to:'recipient@test.invalid',subject:'test',html:'<p>USD</p>',text:'USD'});
   expect(smtp).toHaveBeenCalledWith(expect.objectContaining({from:'USD <usd-russia@yandex.com>'}));
   expect(gmail).not.toHaveBeenCalled();
 });
 it('blocks a mismatched personal Yandex From address before contacting SMTP',async()=>{
   process.env.MAIL_PROVIDER='smtp';
   process.env.SMTP_EGRESS_ALLOWED='true';
   process.env.SMTP_HOST='smtp.yandex.com';
   process.env.SMTP_USER='usd-russia';
   process.env.SMTP_PASSWORD='fake-yandex-app-password';
   process.env.SMTP_FROM='USD <notify@usd-russia.ru>';
   const mail=new MailService();
   const smtp=jest.spyOn((mail as any).transporter,'sendMail');
   expect(mail.getDeliveryStatus()).toMatchObject({provider:'Яндекс Почта (SMTP)',ready:false});
   expect(mail.getDeliveryStatus().missing.join(' ')).toContain('SMTP_FROM');
   await expect((mail as any).sendMessage({to:'recipient@test.invalid',subject:'test',html:'test',text:'test'})).rejects.toThrow('Yandex SMTP_FROM must match');
   expect(smtp).not.toHaveBeenCalled();
 });
 it('explicit provider does not fall back after a Yandex SMTP send error',async()=>{
   process.env.MAIL_PROVIDER='smtp';
   process.env.RESEND_API_KEY='old-resend-secret';
   process.env.GMAIL_REFRESH_TOKEN='old-gmail-refresh';
   process.env.SMTP_EGRESS_ALLOWED='true';
   process.env.SMTP_HOST='smtp.yandex.com';
   process.env.SMTP_USER='usd-russia@yandex.com';
   process.env.SMTP_PASSWORD='fake-yandex-app-password';
   process.env.SMTP_FROM='usd-russia@yandex.com';
   const mail=new MailService();
   const smtp=jest.spyOn((mail as any).transporter,'sendMail').mockRejectedValue(new Error('connection refused') as never);
   const gmail=jest.spyOn(mail as any,'sendViaGmailApi');
   await expect((mail as any).sendMessage({to:'recipient@test.invalid',subject:'test',html:'test',text:'test'})).rejects.toThrow('connection refused');
   expect(smtp).toHaveBeenCalledTimes(1);
   expect(gmail).not.toHaveBeenCalled();
 });
 it('blocks unknown MAIL_PROVIDER values without leaking the environment',async()=>{
   process.env.MAIL_PROVIDER='smtp-or-gmail';
   process.env.SMTP_HOST='smtp.yandex.com';
   const mail=new MailService();
   expect(mail.getDeliveryStatus()).toMatchObject({ready:false,provider:'MAIL_PROVIDER'});
   await expect((mail as any).sendMessage({to:'recipient@test.invalid',subject:'test',html:'test',text:'test'})).rejects.toThrow('MAIL_PROVIDER must be smtp, gmail or resend');
 });
 it('reports disabled egress for a complete Yandex setup',()=>{
   process.env.MAIL_PROVIDER='smtp';
   process.env.SMTP_HOST='smtp.yandex.com';
   process.env.SMTP_USER='usd-russia';
   process.env.SMTP_PASSWORD='fake-yandex-app-password';
   process.env.SMTP_FROM='USD <usd-russia@yandex.com>';
   const mail=new MailService();
   expect(mail.getDeliveryStatus()).toMatchObject({ready:false,provider:'Яндекс Почта (SMTP)'});
   expect(mail.getDeliveryStatus().missing).toContain('SMTP_EGRESS_ALLOWED=true');
 });

 it('still supports existing Russian Yandex SMTP accounts without forcing a domain migration',async()=>{
   process.env.MAIL_PROVIDER='smtp';
   process.env.SMTP_EGRESS_ALLOWED='true';
   process.env.SMTP_HOST='smtp.yandex.ru';
   process.env.SMTP_USER='usd-russia';
   process.env.SMTP_PASSWORD='fake-app-password';
   process.env.SMTP_FROM='USD <usd-russia@yandex.ru>';
   const mail=new MailService();
   const smtp=jest.spyOn((mail as any).transporter,'sendMail').mockResolvedValue({
     accepted:['recipient@test.invalid'],rejected:[],messageId:'legacy-yandex'
   } as never);
   expect(mail.getDeliveryStatus()).toMatchObject({provider:'Яндекс Почта (SMTP)',ready:true,missing:[]});
   await (mail as any).sendMessage({to:'recipient@test.invalid',subject:'test',text:'test',html:'test'});
   expect(smtp).toHaveBeenCalledWith(expect.objectContaining({from:'USD <usd-russia@yandex.ru>'}));
 });
 it('refuses mismatched yandex.ru sender when using smtp.yandex.com',async()=>{
   process.env.MAIL_PROVIDER='smtp';
   process.env.SMTP_EGRESS_ALLOWED='true';
   process.env.SMTP_HOST='smtp.yandex.com';
   process.env.SMTP_USER='usd-russia';
   process.env.SMTP_PASSWORD='fake-app-password';
   process.env.SMTP_FROM='USD <usd-russia@yandex.ru>';
   const mail=new MailService();
   const smtp=jest.spyOn((mail as any).transporter,'sendMail');
   expect(mail.getDeliveryStatus()).toMatchObject({provider:'Яндекс Почта (SMTP)',ready:false});
   await expect((mail as any).sendMessage({to:'recipient@test.invalid',subject:'test',text:'test',html:'test'})).rejects.toThrow('Yandex SMTP_FROM must match');
   expect(smtp).not.toHaveBeenCalled();
 });

});
