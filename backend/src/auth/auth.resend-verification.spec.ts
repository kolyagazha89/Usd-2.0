import { jest } from '@jest/globals';
import { AuthService } from './auth.service';

const response = { success: true, retryAfterSeconds: 60, message: 'Если аккаунт с этим email ожидает подтверждения, мы попробуем отправить письмо. Проверьте «Входящие» и «Спам». Повторить запрос можно через минуту.' };
describe('verification resend limits', () => {
  let prisma: any, mail: any, service: AuthService, account: any, audits: any[], tokens: any[], inTransaction: boolean;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-08T10:00:00Z'));
    account = { id: 'user-1', email: 'person@example.com', emailVerifiedAt: null, isActive: true, lastVerificationResendAt: null };
    audits = []; tokens = [{ id: 'old-link', tokenHash: 'old-hash' }]; inTransaction = false;
    prisma = {
      user: {
        findUnique: jest.fn().mockImplementation(async () => account),
        updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
          if (!account || account.emailVerifiedAt || !account.isActive || (account.lastVerificationResendAt && account.lastVerificationResendAt > where.OR[1].lastVerificationResendAt.lte)) return { count: 0 };
          account.lastVerificationResendAt = data.lastVerificationResendAt; return { count: 1 };
        }),
      },
      auditLog: {
        count: jest.fn().mockImplementation(async ({where}: any) => audits.filter(a => a.action === where.action && a.createdAt >= where.createdAt.gte).length),
        create: jest.fn().mockImplementation(async ({data}: any) => { const a = { ...data, createdAt: new Date() }; audits.push(a); return a; }),
      },
      emailVerificationToken: {
        deleteMany: jest.fn().mockImplementation(async () => { tokens = []; return { count: 1 }; }),
        create: jest.fn().mockImplementation(async ({data}: any) => { tokens.push(data); return data; }),
      },
      $transaction: jest.fn().mockImplementation(async (fn: any) => { inTransaction = true; try { return await fn(prisma); } finally { inTransaction = false; } }),
    };
    mail = { sendVerificationEmail: jest.fn().mockImplementation(async () => { expect(inTransaction).toBe(false); }) };
    service = new AuthService(prisma, {} as any, mail);
  });
  afterEach(() => jest.useRealTimers());

  it('normalizes the address and sends only after committing its reservation', async () => {
    expect(await service.resendVerificationEmail(' PERSON@example.com ')).toEqual(response);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({where:{email:'person@example.com'},select:{id:true,email:true,emailVerifiedAt:true}});
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(audits.filter(a=>a.action==='EMAIL_VERIFICATION_RESEND_REQUESTED')).toHaveLength(1);
  });
  it('retains earlier valid links when a resend fails and consumes its cooldown', async () => {
    mail.sendVerificationEmail.mockRejectedValue(new Error('private provider details'));
    expect(await service.resendVerificationEmail(account.email)).toEqual(response);
    expect(tokens.some(t=>t.id==='old-link')).toBe(true);
    await service.resendVerificationEmail(account.email);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(audits.at(-1).metadata).toEqual({failureCode:'SMTP_SEND_FAILED'});
  });
  it('allows the exact60-second boundary, but rejects59.999seconds', async () => {
    await service.resendVerificationEmail(account.email);
    jest.advanceTimersByTime(59_999); await service.resendVerificationEmail(account.email);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1); await service.resendVerificationEmail(account.email);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(2);
  });
  it('allows at most5resends per rolling hour even after service restart', async () => {
    for(let i=0;i<5;i++){await service.resendVerificationEmail(account.email);jest.advanceTimersByTime(61_000);}
    service = new AuthService(prisma, {} as any, mail);
    expect(await service.resendVerificationEmail(account.email)).toEqual(response);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(5);
    expect(tokens).toHaveLength(6);
    jest.advanceTimersByTime(3_600_001);
    await service.resendVerificationEmail(account.email);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(6);
  });
  it('counts failed provider attempts against the hourly quota', async () => {
    mail.sendVerificationEmail.mockRejectedValue(new Error('offline'));
    for(let i=0;i<6;i++){expect(await service.resendVerificationEmail(account.email)).toEqual(response);jest.advanceTimersByTime(61_000);}
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(5);
  });
  it('keeps missing, verified, inactive and limited responses identical', async () => {
    for(const value of [null,{...account,emailVerifiedAt:new Date()},{...account,isActive:false},{...account,lastVerificationResendAt:new Date()}]){
      account=value;expect(await service.resendVerificationEmail('person@example.com')).toEqual(response);
    }
    expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
  });
  it('fails closed beforeSMTP if the reservation transaction fails', async () => {
    prisma.$transaction.mockRejectedValue(new Error('database unavailable'));
    await expect(service.resendVerificationEmail(account.email)).rejects.toThrow('database unavailable');
    expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
  });
});
