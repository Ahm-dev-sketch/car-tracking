import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import crypto from 'crypto';
import { getSessionUser } from '@/lib/auth-guard';
import { getClientContext } from '@/lib/request-context';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/server/audit';
import { notifyAdmins } from '@/server/notifications/service';
import { publishEvent } from '@/server/realtime/hub';
import { uploadFileToStorage } from '@/server/storage/service';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
]);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);

export async function POST(
  req: NextRequest,
  context?: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // 1. Authenticate user
    let user;
    try {
      user = await getSessionUser();
    } catch (authErr: any) {
      console.error('[Upload Nota Dinas Error]: Authentication required', authErr);
      return NextResponse.json(
        {
          success: false,
          message: 'Sesi login telah berakhir. Silakan login kembali.',
          error: { code: 'UNAUTHORIZED', message: authErr?.message || 'Authentication required' },
        },
        { status: 401 }
      );
    }

    // 2. Validate booking ID
    const resolvedParams = context?.params ? await Promise.resolve(context.params) : null;
    const id = resolvedParams?.id;
    if (!id || typeof id !== 'string') {
      console.error('[Upload Nota Dinas Error]: Missing booking id');
      return NextResponse.json(
        {
          success: false,
          message: 'Booking ID tidak valid atau hilang',
          error: { code: 'INVALID_ID', message: 'Missing booking id' },
        },
        { status: 400 }
      );
    }

    // 3. Find booking in database
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        driver: true,
      },
    });

    if (!booking) {
      console.error(`[Upload Nota Dinas Error]: Booking #${id} not found`);
      return NextResponse.json(
        {
          success: false,
          message: 'Booking tidak ditemukan',
          error: { code: 'NOT_FOUND', message: 'Booking not found' },
        },
        { status: 404 }
      );
    }

    // 4. Authorization check: owner, assigned driver, or admin
    const isOwner = booking.userId === user.id;
    const isDriver = booking.driver?.userId === user.id || booking.driverId === user.id;
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

    if (!isOwner && !isDriver && !isAdmin) {
      console.error(
        `[Upload Nota Dinas Error]: User ${user.id} (${user.role}) is not authorized to upload for booking ${id}`
      );
      return NextResponse.json(
        {
          success: false,
          message: 'Hanya pemesan, driver, atau admin yang dapat mengunggah Nota Dinas untuk pesanan ini',
          error: {
            code: 'FORBIDDEN',
            message: 'Hanya pemesan atau driver yang dapat mengunggah Nota Dinas',
          },
        },
        { status: 403 }
      );
    }

    // 5. Parse multipart form data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (formErr) {
      console.error('[Upload Nota Dinas Error]: Could not parse multipart form data', formErr);
      return NextResponse.json(
        {
          success: false,
          message: 'Format data unggahan tidak valid (harus multipart form-data)',
          error: { code: 'INVALID_FORM_DATA', message: 'Could not parse multipart form data' },
        },
        { status: 400 }
      );
    }

    const file = formData.get('file');
    if (!file || typeof file === 'string' || !(file instanceof Blob)) {
      console.error('[Upload Nota Dinas Error]: No valid file uploaded');
      return NextResponse.json(
        {
          success: false,
          message: 'File dokumen Nota Dinas wajib dilampirkan',
          error: { code: 'FILE_REQUIRED', message: 'No file uploaded or invalid file field' },
        },
        { status: 400 }
      );
    }

    // 6. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      console.error(`[Upload Nota Dinas Error]: File size (${file.size}) exceeds limit`);
      return NextResponse.json(
        {
          success: false,
          message: `Ukuran file (${(file.size / (1024 * 1024)).toFixed(2)} MB) melebihi batas maksimal 10MB`,
          error: { code: 'FILE_TOO_LARGE', message: 'File size exceeds maximum limit of 10MB' },
        },
        { status: 400 }
      );
    }

    // 7. Validate MIME type and extension
    const originalName = file instanceof File ? file.name : 'nota-dinas.pdf';
    const extFromName = path.extname(originalName).toLowerCase();
    const isValidMime = ALLOWED_MIME_TYPES.has(file.type);
    const isValidExt = ALLOWED_EXTENSIONS.has(extFromName);

    if (!isValidMime && !isValidExt) {
      console.error(
        `[Upload Nota Dinas Error]: Invalid file type "${file.type}" or extension "${extFromName}"`
      );
      return NextResponse.json(
        {
          success: false,
          message: 'Hanya dokumen PDF dan gambar format JPEG, PNG, atau WebP yang diperbolehkan',
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'Only PDF documents and JPEG, PNG, WebP images are allowed',
          },
        },
        { status: 400 }
      );
    }

    const safeExt = isValidExt
      ? extFromName
      : file.type === 'application/pdf'
      ? '.pdf'
      : file.type === 'image/png'
      ? '.png'
      : file.type === 'image/webp'
      ? '.webp'
      : '.jpg';

    const effectiveMimeType =
      isValidMime && file.type
        ? file.type
        : safeExt === '.pdf'
        ? 'application/pdf'
        : safeExt === '.png'
        ? 'image/png'
        : safeExt === '.webp'
        ? 'image/webp'
        : 'image/jpeg';

    const cleanBookingNum = (booking.bookingNumber || 'BK').replace(/[^a-zA-Z0-9_-]/g, '');
    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const filename = `nota-${cleanBookingNum}-${Date.now()}-${randomSuffix}${safeExt}`;

    // Read buffer safely
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 8. Upload to Storage (Supabase Storage with local fallback)
    const uploadResult = await uploadFileToStorage({
      bucket: 'nota-dinas',
      folder: cleanBookingNum,
      filename,
      buffer,
      contentType: effectiveMimeType,
      originalName,
    });

    if (!uploadResult.success || !uploadResult.publicUrl) {
      console.error('[Upload Nota Dinas Error]: Storage upload failed:', uploadResult.error);
      return NextResponse.json(
        {
          success: false,
          message:
            uploadResult.error ||
            'Gagal menyimpan file ke penyimpanan. Silakan periksa konfigurasi Supabase Storage.',
          error: {
            code: 'STORAGE_UPLOAD_FAILED',
            message: uploadResult.error || 'Storage upload failed',
          },
        },
        { status: 400 }
      );
    }

    const publicUrl = uploadResult.publicUrl;

    // 9. Update Database Record
    const updated = await prisma.booking.update({
      where: { id },
      data: {
        notaDinasUrl: publicUrl,
        notaDinasFilename: originalName,
        rejectedReason: null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        driver: { include: { user: { select: { id: true, name: true, phone: true } } } },
        vehicle: true,
        operationalLocation: true,
      },
    });

    // 10. Background operations (non-blocking)
    try {
      const ctx = getClientContext(req, user.id);
      await logAuditEvent({
        actorUserId: user.id,
        action: 'booking.nota_dinas_uploaded',
        entityType: 'Booking',
        entityId: id,
        newValue: {
          notaDinasUrl: publicUrl,
          notaDinasFilename: originalName,
          fileSize: file.size,
          storageProvider: uploadResult.storageProvider,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    } catch (auditErr) {
      console.error('[Upload Nota Dinas Error]: Audit log failed:', auditErr);
    }

    try {
      await notifyAdmins({
        type: 'BOOKING_NOTA_DINAS_UPLOADED',
        title: 'Nota Dinas Diunggah',
        body: `Nota dinas untuk booking ${updated.bookingNumber} telah diunggah (${originalName}). Silakan verifikasi dan berikan approval.`,
        data: { bookingId: updated.id },
      });
    } catch (notifErr) {
      console.error('[Upload Nota Dinas Error]: Admin notification failed:', notifErr);
    }

    try {
      await publishEvent({
        type: 'booking:update',
        data: { bookingId: updated.id, status: updated.status, userId: updated.userId },
      });
    } catch (realtimeErr) {
      console.error('[Upload Nota Dinas Error]: Realtime event failed:', realtimeErr);
    }

    // 11. Return clean structured JSON
    return NextResponse.json({
      success: true,
      url: publicUrl,
      data: updated,
    });
  } catch (error: any) {
    console.error('[Upload Nota Dinas Error]:', error);
    return NextResponse.json(
      {
        success: false,
        message: error?.message || 'Terjadi kesalahan internal server saat memproses Nota Dinas',
        error: {
          code: 'INTERNAL_ERROR',
          message: error?.message || 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}
