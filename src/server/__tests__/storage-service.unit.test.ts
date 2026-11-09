import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  createBucket: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs/promises', () => ({
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mocks.upload,
        getPublicUrl: mocks.getPublicUrl,
      })),
      createBucket: mocks.createBucket,
    },
  })),
}));

import { uploadFileToStorage } from '../storage/service';

describe('uploadFileToStorage', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    };
  });

  it('successfully uploads file directly to Supabase storage', async () => {
    mocks.upload.mockResolvedValue({ data: { path: 'path/file.png' }, error: null });
    mocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/nota-dinas/path/file.png' },
    });

    const result = await uploadFileToStorage({
      bucket: 'nota-dinas',
      folder: 'BK-100',
      buffer: Buffer.from('hello'),
      contentType: 'image/png',
      originalName: 'nota.png',
    });

    expect(result.success).toBe(true);
    expect(result.storageProvider).toBe('supabase');
    expect(result.publicUrl).toBe(
      'https://test.supabase.co/storage/v1/object/public/nota-dinas/path/file.png'
    );
  });

  it('auto-creates bucket and retries upload when bucket is initially missing', async () => {
    // First upload fails with NoSuchBucket
    mocks.upload.mockResolvedValueOnce({
      data: null,
      error: { message: 'Bucket not found', code: 'NoSuchBucket', statusCode: '404' },
    });
    // createBucket succeeds
    mocks.createBucket.mockResolvedValueOnce({ data: { name: 'nota-dinas' }, error: null });
    // Second upload succeeds
    mocks.upload.mockResolvedValueOnce({ data: { path: 'path/file.png' }, error: null });
    mocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/nota-dinas/path/file.png' },
    });

    const result = await uploadFileToStorage({
      bucket: 'nota-dinas',
      folder: 'BK-100',
      buffer: Buffer.from('hello'),
      contentType: 'image/png',
      originalName: 'nota.png',
    });

    expect(mocks.createBucket).toHaveBeenCalledWith(
      'nota-dinas',
      expect.objectContaining({ public: true })
    );
    expect(result.success).toBe(true);
    expect(result.storageProvider).toBe('supabase');
  });

  it('falls back to local storage in non-serverless dev if upload fails', async () => {
    delete process.env.VERCEL;
    mocks.upload.mockResolvedValue({
      data: null,
      error: { message: 'Network timeout', statusCode: '500' },
    });

    const result = await uploadFileToStorage({
      bucket: 'nota-dinas',
      buffer: Buffer.from('hello'),
      contentType: 'image/png',
      originalName: 'nota.png',
    });

    expect(result.success).toBe(true);
    expect(result.storageProvider).toBe('local');
    expect(result.publicUrl).toContain('/uploads/nota-dinas/');
    expect(mocks.mkdir).toHaveBeenCalled();
    expect(mocks.writeFile).toHaveBeenCalled();
  });

  it('returns structured error in Vercel environment if Supabase bucket is missing and cannot be auto-created', async () => {
    process.env.VERCEL = '1';
    mocks.upload.mockResolvedValue({
      data: null,
      error: { message: 'Bucket not found', statusCode: '404' },
    });
    mocks.createBucket.mockResolvedValue({
      data: null,
      error: { message: 'Access denied: RLS violation' },
    });

    const result = await uploadFileToStorage({
      bucket: 'nota-dinas',
      buffer: Buffer.from('hello'),
      contentType: 'image/png',
      originalName: 'nota.png',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Bucket Supabase Storage "nota-dinas" belum tersedia');
  });
});
