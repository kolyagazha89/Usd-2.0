import {jest} from '@jest/globals';
import {MailService} from './mail.service';

describe('USD mail provider selection and safe diagnostics',()=>{
 const keys=['RESEND_API_KEY','RESEND_FROM_EMAIL','GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','GMAIL_SENDER_EMAIL','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SMTP_EGRESS_ALLOWED','SMTP_HOST','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'];
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
});
