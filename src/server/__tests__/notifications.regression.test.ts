import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), admins: vi.fn(), publish: vi.fn(), warn: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { notification: { create: mocks.create }, user: { findMany: mocks.admins } } }));
vi.mock('@/server/realtime/hub', () => ({ publishEvent: mocks.publish }));
vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.warn } }));
import { notify, notifyAdmins } from '@/server/notifications/service';

const payload = { type: 'TRIP_STARTED', title: 'Trip started', body: 'Your driver is en route.' };
beforeEach(() => vi.resetAllMocks());

it('logs persistence failure without reporting a committed business action as failed', async () => {
  mocks.create.mockRejectedValue(new Error('Notification storage unavailable'));
  await expect(notify('passenger', payload)).resolves.toBeNull();
  expect(mocks.warn).toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
});

it('isolates failures between notification recipients', async () => {
  mocks.admins.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);
  mocks.create.mockRejectedValueOnce(new Error('First recipient failed')).mockResolvedValueOnce({
    id: BigInt(2), userId: 'admin-2', ...payload, data: null, readAt: null, createdAt: new Date(),
  });
  await expect(notifyAdmins(payload)).resolves.toBeUndefined();
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(mocks.publish).toHaveBeenCalledOnce();
});

it('does not break a committed action when the admin lookup fails', async () => {
  mocks.admins.mockRejectedValue(new Error('Lookup unavailable'));
  await expect(notifyAdmins(payload)).resolves.toBeUndefined();
  expect(mocks.warn).toHaveBeenCalled();
});
