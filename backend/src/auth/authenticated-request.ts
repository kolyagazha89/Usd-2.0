import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  /** Guard grants self-service fallback without conferring operational RBAC rights. */
  personalAccountAccess?: boolean;
  user: {
    sub: string;
    email?: string;
    role: 'ADMIN' | 'PARTICIPANT';
    participantId?: string;
    customRoleId?: string;
    customRole?: { id: string; key: string; name: string; permissions: unknown } | null;
  };
}
