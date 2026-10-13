import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email?: string;
    role: 'ADMIN' | 'JUDGE' | 'PARTICIPANT';
    participantId?: string;
    customRoleId?: string;
  };
}
