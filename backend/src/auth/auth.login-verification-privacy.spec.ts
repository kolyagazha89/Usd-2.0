import { jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('login verification privacy', () => {
  const email = 'driver@example.com';
  const correctPassword = 'correct-password-long';
  let hash: string, account: any, db: any, service: AuthService;

  beforeAll(async () => { hash = await bcrypt.hash(correctPassword, 4); });
  beforeEach(() => {
    account = {
      id: 'synthetic-user', email, passwordHash: hash, isActive: true,
      emailVerifiedAt: null, role: 'PARTICIPANT', customRole: null,
    };
    db = {
      user: { findUnique: jest.fn(async () => account) },
      refreshSession: { create: jest.fn(async () => ({})) },
    };
    service = new AuthService(db, {} as never, {} as never);
  });

  it('does not reveal that an unverified account exists when password is wrong', async () => {
    await expect(service.login(' DRIVER@example.com ', 'not-the-password')).rejects.toThrow('Неверный email или пароль');
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email }, include: expect.any(Object) });
    expect(db.refreshSession.create).not.toHaveBeenCalled();
  });

  it('only tells the owner to verify email after a valid password', async () => {
    await expect(service.login(email, correctPassword)).rejects.toThrow('Email не подтверждён');
    expect(db.refreshSession.create).not.toHaveBeenCalled();
  });

  it('uses the same generic error for an unknown account and invalid password', async () => {
    account = null;
    await expect(service.login(email, 'not-the-password')).rejects.toThrow('Неверный email или пароль');
    expect(db.refreshSession.create).not.toHaveBeenCalled();
  });

  it('does not disclose verified account state on an invalid password', async () => {
    account.emailVerifiedAt = new Date();
    await expect(service.login(email, 'not-the-password')).rejects.toThrow('Неверный email или пароль');
    expect(db.refreshSession.create).not.toHaveBeenCalled();
  });
});
