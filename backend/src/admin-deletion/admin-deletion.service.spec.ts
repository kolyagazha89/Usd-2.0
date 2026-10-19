import { AdminDeletionService } from './admin-deletion.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
describe('admin permanent deletion boundary', () => {
  const request = (role: string) =>
    ({
      user: { sub: 'actor', role, customRoleId: 'all-permissions' },
    }) as AuthenticatedRequest;
  const setup = (
    actor: any = { id: 'actor', role: 'ADMIN', isActive: true },
  ) => {
    let transactions = 0;
    const tx = { user: { findUnique: async () => actor } };
    const db = {
      $transaction: async (fn: any) => {
        transactions++;
        return fn(tx);
      },
    };
    return {
      service: new AdminDeletionService(
        db as any,
        {} as any,
        {} as any,
        {} as any,
      ),
      count: () => transactions,
    };
  };
  it('rejects unknown entity types before querying the database', async () => {
    const { service, count } = setup();
    await expect(
      service.preview('database', 'any', request('ADMIN')),
    ).rejects.toThrow('Неизвестный');
    expect(count()).toBe(0);
  });
  it('does not allow a delegated permission matrix to grant permanent deletion', async () => {
    const { service } = setup();
    await expect(
      service.preview('participant', 'any', request('PARTICIPANT')),
    ).rejects.toThrow('только ADMIN');
  });
  it.each([
    { role: 'PARTICIPANT', isActive: true },
    { role: 'ADMIN', isActive: false },
    null,
  ])(
    'checks current account state independently of the token: %j',
    async (actor) => {
      const { service } = setup(actor);
      await expect(
        service.preview('user', 'any', request('ADMIN')),
      ).rejects.toThrow('активному ADMIN');
    },
  );
  it('keeps pending file cleanup durable and retries only failed object keys', async () => {
    const updates: any[] = [];
    const db = {
      auditLog: {
        findMany: async () => [
          {
            id: 'receipt',
            metadata: {
              counts: { cars: 1 },
              storageCleanupPending: true,
              objectKeys: ['file1', 'file2'],
            },
          },
        ],
        update: async (input: any) => updates.push(input),
      },
    };
    const media = {
      deleteStoredObjects: async (keys: string[]) => {
        expect(keys).toEqual(['file1', 'file2']);
        return ['file2'];
      },
    };
    const service = new AdminDeletionService(
      db as any,
      {} as any,
      {} as any,
      media as any,
    );
    await service.retryPendingStorage();
    expect(updates[0].data.metadata).toEqual({
      counts: { cars: 1 },
      storageCleanupPending: true,
      objectKeys: ['file2'],
    });
  });
});
