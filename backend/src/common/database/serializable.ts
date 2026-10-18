import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/** Retry database serialization conflicts only; callbacks contain no external
 * effects. An exhausted retry rolls the whole operation back. */
export async function serializable<T>(db: PrismaService, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(work, {isolationLevel:'Serializable',timeout:15_000}); }
    catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code !== 'P2034' || attempt >= 2) throw error;
      await new Promise(resolve=>setTimeout(resolve,25 * (attempt + 1)));
    }
  }
}
