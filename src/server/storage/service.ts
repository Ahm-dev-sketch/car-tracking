import { createClient, SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import crypto from 'crypto';
import { mkdir, writeFile } from 'fs/promises';

export interface UploadFileOptions {
  bucket: string;
  folder?: string;
  filename?: string;
  buffer: Buffer;
  contentType: string;
  originalName: string;
}

export interface StorageUploadResult {
  success: boolean;
  publicUrl: string;
  storageProvider: 'supabase' | 'local';
  filename: string;
  error?: string;
}

/**
 * Returns an authenticated Supabase client for storage operations.
 * Prioritizes SUPABASE_SERVICE_ROLE_KEY to bypass RLS policies and allow bucket creation.
 */
export function getStorageSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  if (!url || !key || url === 'https://placeholder.supabase.co') {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Uploads a file to Supabase Storage with graceful auto-bucket creation,
 * local filesystem fallback in non-serverless environments, and detailed error messages.
 */
export async function uploadFileToStorage(
  options: UploadFileOptions
): Promise<StorageUploadResult> {
  const { bucket, folder, filename, buffer, contentType, originalName } = options;

  const extFromName = path.extname(originalName).toLowerCase();
  const safeBase = originalName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 30);
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const finalFilename =
    filename || `${safeBase}-${Date.now()}-${randomSuffix}${extFromName}`;
  const storagePath = folder ? `${folder}/${finalFilename}` : finalFilename;

  const supabase = getStorageSupabaseClient();

  if (supabase) {
    try {
      let uploadRes = await supabase.storage
        .from(bucket)
        .upload(storagePath, buffer, {
          contentType,
          upsert: true,
        });

      // Handle missing bucket
      const isNoSuchBucket =
        Boolean(uploadRes.error) &&
        (uploadRes.error?.message?.toLowerCase().includes('bucket not found') ||
          (uploadRes.error as { statusCode?: string; status?: number })?.statusCode === '404' ||
          (uploadRes.error as { statusCode?: string; status?: number })?.status === 404 ||
          (uploadRes.error as { code?: string })?.code === 'NoSuchBucket');

      if (isNoSuchBucket) {
        try {
          const createBucketRes = await supabase.storage.createBucket(bucket, {
            public: true,
            fileSizeLimit: 10 * 1024 * 1024,
            allowedMimeTypes: [
              'application/pdf',
              'image/jpeg',
              'image/png',
              'image/webp',
              'image/jpg',
            ],
          });

          if (!createBucketRes.error) {
            uploadRes = await supabase.storage
              .from(bucket)
              .upload(storagePath, buffer, {
                contentType,
                upsert: true,
              });
          } else {
            console.warn(
              `[Storage Service] Could not auto-create bucket "${bucket}":`,
              createBucketRes.error.message
            );
          }
        } catch (createErr) {
          console.warn(`[Storage Service] Exception auto-creating bucket "${bucket}":`, createErr);
        }
      }

      if (!uploadRes.error) {
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
        return {
          success: true,
          publicUrl: urlData.publicUrl,
          storageProvider: 'supabase',
          filename: finalFilename,
        };
      }

      console.error(
        `[Storage Service] Supabase upload to "${bucket}" failed:`,
        uploadRes.error
      );

      // In non-serverless environments (local dev), try local filesystem fallback
      if (!process.env.VERCEL) {
        try {
          const targetDir = path.join(process.cwd(), 'public', 'uploads', bucket);
          await mkdir(targetDir, { recursive: true });
          const filePath = path.join(targetDir, finalFilename);
          await writeFile(filePath, buffer);

          return {
            success: true,
            publicUrl: `/uploads/${bucket}/${finalFilename}`,
            storageProvider: 'local',
            filename: finalFilename,
          };
        } catch (localErr) {
          console.error('[Storage Service] Local fallback failed:', localErr);
        }
      }

      const errorMessage = isNoSuchBucket
        ? `Bucket Supabase Storage "${bucket}" belum tersedia. Silakan buat bucket "${bucket}" (Public) di Supabase Dashboard (Storage > New Bucket), atau atur SUPABASE_SERVICE_ROLE_KEY di Environment Variables Vercel.`
        : `Gagal mengunggah file ke Supabase Storage (Bucket: "${bucket}"): ${uploadRes.error.message}. Pastikan izin Storage (RLS Policy) mengizinkan upload atau tambahkan SUPABASE_SERVICE_ROLE_KEY di Environment Variables.`;

      return {
        success: false,
        publicUrl: '',
        storageProvider: 'supabase',
        filename: finalFilename,
        error: errorMessage,
      };
    } catch (supabaseEx: any) {
      console.error('[Storage Service] Unexpected Supabase Storage exception:', supabaseEx);
    }
  }

  // Fallback to local filesystem if Supabase client could not be initialized
  if (!process.env.VERCEL) {
    try {
      const targetDir = path.join(process.cwd(), 'public', 'uploads', bucket);
      await mkdir(targetDir, { recursive: true });
      const filePath = path.join(targetDir, finalFilename);
      await writeFile(filePath, buffer);

      return {
        success: true,
        publicUrl: `/uploads/${bucket}/${finalFilename}`,
        storageProvider: 'local',
        filename: finalFilename,
      };
    } catch (fsErr: any) {
      return {
        success: false,
        publicUrl: '',
        storageProvider: 'local',
        filename: finalFilename,
        error: `Sistem penyimpanan lokal gagal (${fsErr.message}) dan Supabase Storage belum dikonfigurasi.`,
      };
    }
  }

  return {
    success: false,
    publicUrl: '',
    storageProvider: 'supabase',
    filename: finalFilename,
    error:
      'Kredensial Supabase Storage (NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY) belum diset dan sistem file serverless bersifat read-only. Silakan konfigurasikan Environment Variables di Vercel.',
  };
}
