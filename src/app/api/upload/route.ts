import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { withErrorHandling, ApiError } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      throw new ApiError(400, 'INVALID_FORM_DATA', 'Could not parse multipart form data');
    }

    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      throw new ApiError(400, 'FILE_REQUIRED', 'No file uploaded or invalid file field');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError(400, 'FILE_TOO_LARGE', 'File size exceeds maximum limit of 5MB');
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new ApiError(
        400,
        'INVALID_FILE_TYPE',
        'Only JPEG, PNG, and WebP images are allowed'
      );
    }

    const extFromName = path.extname(file.name).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(extFromName)
      ? extFromName
      : file.type === 'image/png'
      ? '.png'
      : file.type === 'image/webp'
      ? '.webp'
      : '.jpg';

    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const filename = `vehicle-${Date.now()}-${randomSuffix}${safeExt}`;

    const targetDir = path.join(process.cwd(), 'public', 'uploads', 'vehicles');
    await mkdir(targetDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(targetDir, filename);
    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/vehicles/${filename}`;

    return NextResponse.json(
      {
        data: {
          url: publicUrl,
          filename,
          size: file.size,
          type: file.type,
        },
      },
      { status: 201 }
    );
  }),
  RATE_LIMIT_CONFIG.ADMIN_MUTATION
);
