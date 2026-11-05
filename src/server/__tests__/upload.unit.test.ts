import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.user },
  },
}));
vi.mock('fs/promises', () => ({
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
}));

import { POST } from '../../app/api/upload/route';

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    mocks.auth.mockResolvedValue(null);

    const formData = new FormData();
    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, undefined as any);
    expect(res.status).toBe(401);
  });

  it('rejects non-admin users with 403', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.user.mockResolvedValue({
      id: 'user-1',
      name: 'User',
      email: 'user@test.com',
      isActive: true,
      role: { code: 'USER' },
    });

    const formData = new FormData();
    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, undefined as any);
    expect(res.status).toBe(403);
  });

  it('rejects request with missing file with 400', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1' } });
    mocks.user.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@test.com',
      isActive: true,
      role: { code: 'ADMIN' },
    });

    const formData = new FormData();
    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, undefined as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('FILE_REQUIRED');
  });

  it('rejects files larger than 5MB with 400 FILE_TOO_LARGE', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1' } });
    mocks.user.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@test.com',
      isActive: true,
      role: { code: 'ADMIN' },
    });

    // 5.5MB file
    const oversizedBlob = new Blob([new Uint8Array(5.5 * 1024 * 1024)], { type: 'image/jpeg' });
    const file = new File([oversizedBlob], 'huge.jpg', { type: 'image/jpeg' });

    const formData = new FormData();
    formData.append('file', file);

    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, undefined as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects unsupported MIME types with 400 INVALID_FILE_TYPE', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1' } });
    mocks.user.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@test.com',
      isActive: true,
      role: { code: 'ADMIN' },
    });

    const textBlob = new Blob(['hello world'], { type: 'text/plain' });
    const file = new File([textBlob], 'sample.txt', { type: 'text/plain' });

    const formData = new FormData();
    formData.append('file', file);

    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, undefined as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('successfully uploads valid image <= 5MB and returns public URL', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1' } });
    mocks.user.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@test.com',
      isActive: true,
      role: { code: 'ADMIN' },
    });

    const imgBlob = new Blob([new Uint8Array(1024)], { type: 'image/png' });
    const file = new File([imgBlob], 'car.png', { type: 'image/png' });

    const formData = new FormData();
    formData.append('file', file);

    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req, undefined as any);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.url).toMatch(/^\/uploads\/vehicles\/vehicle-\d+-[a-f0-9]+\.png$/);
    expect(mocks.writeFile).toHaveBeenCalled();
  });
});
