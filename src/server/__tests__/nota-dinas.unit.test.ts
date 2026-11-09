import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  bookingFindUnique: vi.fn(),
  bookingUpdate: vi.fn(),
  uploadFileToStorage: vi.fn(),
  logAuditEvent: vi.fn(),
  notifyAdmins: vi.fn(),
  publishEvent: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    booking: {
      findUnique: mocks.bookingFindUnique,
      update: mocks.bookingUpdate,
    },
  },
}));
vi.mock('@/server/storage/service', () => ({
  uploadFileToStorage: mocks.uploadFileToStorage,
}));
vi.mock('@/server/audit', () => ({
  logAuditEvent: mocks.logAuditEvent,
}));
vi.mock('@/server/notifications/service', () => ({
  notifyAdmins: mocks.notifyAdmins,
}));
vi.mock('@/server/realtime/hub', () => ({
  publishEvent: mocks.publishEvent,
}));

import { POST } from '../../app/api/bookings/[id]/nota-dinas/route';

describe('POST /api/bookings/[id]/nota-dinas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    mocks.auth.mockResolvedValue(null);

    const formData = new FormData();
    formData.append('file', new File(['content'], 'nota.png', { type: 'image/png' }));
    const req = new NextRequest('http://localhost:3000/api/bookings/bk-1/nota-dinas', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'bk-1' }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('rejects requests with missing booking id with 400', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      name: 'User 1',
      role: { code: 'USER' },
      isActive: true,
    });

    const formData = new FormData();
    formData.append('file', new File(['content'], 'nota.png', { type: 'image/png' }));
    const req = new NextRequest('http://localhost:3000/api/bookings//nota-dinas', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, { params: Promise.resolve({ id: '' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_ID');
  });

  it('returns 404 when booking is not found', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      name: 'User 1',
      role: { code: 'USER' },
      isActive: true,
    });
    mocks.bookingFindUnique.mockResolvedValue(null);

    const formData = new FormData();
    formData.append('file', new File(['content'], 'nota.png', { type: 'image/png' }));
    const req = new NextRequest('http://localhost:3000/api/bookings/bk-missing/nota-dinas', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'bk-missing' }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('rejects users who are not owner, driver, or admin with 403', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'other-user' } });
    mocks.userFindUnique.mockResolvedValue({
      id: 'other-user',
      name: 'Other',
      role: { code: 'USER' },
      isActive: true,
    });
    mocks.bookingFindUnique.mockResolvedValue({
      id: 'bk-1',
      bookingNumber: 'BK-2026-0001',
      userId: 'user-owner',
      driverId: 'driver-1',
      driver: { id: 'driver-1', userId: 'driver-user-id' },
    });

    const formData = new FormData();
    formData.append('file', new File(['content'], 'nota.png', { type: 'image/png' }));
    const req = new NextRequest('http://localhost:3000/api/bookings/bk-1/nota-dinas', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'bk-1' }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('rejects uploads exceeding 10MB limit with 400', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'user-owner' } });
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-owner',
      name: 'Owner',
      role: { code: 'USER' },
      isActive: true,
    });
    mocks.bookingFindUnique.mockResolvedValue({
      id: 'bk-1',
      bookingNumber: 'BK-2026-0001',
      userId: 'user-owner',
    });

    const largeFile = new File(['a'.repeat(11 * 1024 * 1024)], 'large-file.pdf', {
      type: 'application/pdf',
    });
    const formData = new FormData();
    formData.append('file', largeFile);
    const req = new NextRequest('http://localhost:3000/api/bookings/bk-1/nota-dinas', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'bk-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects unsupported file formats (e.g. .exe) with 400', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'user-owner' } });
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-owner',
      name: 'Owner',
      role: { code: 'USER' },
      isActive: true,
    });
    mocks.bookingFindUnique.mockResolvedValue({
      id: 'bk-1',
      bookingNumber: 'BK-2026-0001',
      userId: 'user-owner',
    });

    const invalidFile = new File(['virus'], 'script.exe', { type: 'application/x-msdownload' });
    const formData = new FormData();
    formData.append('file', invalidFile);
    const req = new NextRequest('http://localhost:3000/api/bookings/bk-1/nota-dinas', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'bk-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('returns graceful 400 error when storage upload fails', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'user-owner' } });
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-owner',
      name: 'Owner',
      role: { code: 'USER' },
      isActive: true,
    });
    mocks.bookingFindUnique.mockResolvedValue({
      id: 'bk-1',
      bookingNumber: 'BK-2026-0001',
      userId: 'user-owner',
    });
    mocks.uploadFileToStorage.mockResolvedValue({
      success: false,
      publicUrl: '',
      storageProvider: 'supabase',
      filename: 'nota-1.png',
      error: 'Bucket Supabase Storage "nota-dinas" belum tersedia.',
    });

    const validFile = new File(['valid'], 'nota-surat.pdf', { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', validFile);
    const req = new NextRequest('http://localhost:3000/api/bookings/bk-1/nota-dinas', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'bk-1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('Bucket Supabase Storage "nota-dinas" belum tersedia');
  });

  it('successfully uploads valid file, updates booking, and returns 200 with url', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'user-owner' } });
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-owner',
      name: 'Owner',
      role: { code: 'USER' },
      isActive: true,
    });
    mocks.bookingFindUnique.mockResolvedValue({
      id: 'bk-1',
      bookingNumber: 'BK-2026-0001',
      userId: 'user-owner',
      status: 'PENDING_COMPLETION',
      rejectedReason: 'Nota sebelumnya buram',
    });
    mocks.uploadFileToStorage.mockResolvedValue({
      success: true,
      publicUrl: 'https://aisqcrtpmjgqttklm.supabase.co/storage/v1/object/public/nota-dinas/BK-2026-0001/nota-123.png',
      storageProvider: 'supabase',
      filename: 'nota-123.png',
    });
    mocks.bookingUpdate.mockResolvedValue({
      id: 'bk-1',
      bookingNumber: 'BK-2026-0001',
      userId: 'user-owner',
      status: 'PENDING_COMPLETION',
      rejectedReason: null,
      notaDinasUrl:
        'https://aisqcrtpmjgqttklm.supabase.co/storage/v1/object/public/nota-dinas/BK-2026-0001/nota-123.png',
      notaDinasFilename: 'Screenshot (352).png',
    });

    const validFile = new File(['fake-image-bytes'], 'Screenshot (352).png', {
      type: 'image/png',
    });
    const formData = new FormData();
    formData.append('file', validFile);
    const req = new NextRequest('http://localhost:3000/api/bookings/bk-1/nota-dinas', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'bk-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.url).toContain('https://aisqcrtpmjgqttklm.supabase.co');
    expect(body.data.notaDinasFilename).toBe('Screenshot (352).png');
    expect(body.data.rejectedReason).toBeNull();

    expect(mocks.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bk-1' },
        data: expect.objectContaining({
          notaDinasUrl:
            'https://aisqcrtpmjgqttklm.supabase.co/storage/v1/object/public/nota-dinas/BK-2026-0001/nota-123.png',
          notaDinasFilename: 'Screenshot (352).png',
          rejectedReason: null,
        }),
      })
    );
    expect(mocks.logAuditEvent).toHaveBeenCalled();
    expect(mocks.notifyAdmins).toHaveBeenCalled();
    expect(mocks.publishEvent).toHaveBeenCalledWith({
      type: 'booking:update',
      data: expect.objectContaining({ bookingId: 'bk-1' }),
    });
  });
});
