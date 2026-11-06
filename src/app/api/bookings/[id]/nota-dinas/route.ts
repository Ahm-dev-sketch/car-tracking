import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { withErrorHandling, ApiError } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { getClientContext } from '@/lib/request-context';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/server/audit';
import { notifyAdmins } from '@/server/notifications/service';
import { publishEvent } from '@/server/realtime/hub';

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

export const POST = withErrorHandling(
  async (req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      throw new ApiError(400, 'INVALID_ID', 'Missing booking id');
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        driver: true,
      },
    });

    if (!booking) {
      throw new ApiError(404, 'NOT_FOUND', 'Booking not found');
    }

    const isOwner = booking.userId === user.id;
    const isDriver = booking.driver?.userId === user.id || booking.driverId === user.id;

    if (!isOwner && !isDriver) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Hanya pemesan atau driver yang dapat mengunggah Nota Dinas'
      );
    }

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
      throw new ApiError(400, 'FILE_TOO_LARGE', 'File size exceeds maximum limit of 10MB');
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new ApiError(
        400,
        'INVALID_FILE_TYPE',
        'Only PDF documents and JPEG, PNG, WebP images are allowed'
      );
    }

    const extFromName = path.extname(file.name).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(extFromName)
      ? extFromName
      : file.type === 'application/pdf'
      ? '.pdf'
      : file.type === 'image/png'
      ? '.png'
      : file.type === 'image/webp'
      ? '.webp'
      : '.jpg';

    const cleanBookingNum = booking.bookingNumber.replace(/[^a-zA-Z0-9_-]/g, '');
    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const filename = `nota-${cleanBookingNum}-${Date.now()}-${randomSuffix}${safeExt}`;

    const targetDir = path.join(process.cwd(), 'public', 'uploads', 'nota-dinas');
    await mkdir(targetDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(targetDir, filename);
    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/nota-dinas/${filename}`;

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        notaDinasUrl: publicUrl,
        notaDinasFilename: file.name,
        rejectedReason: null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        driver: { include: { user: { select: { id: true, name: true, phone: true } } } },
        vehicle: true,
        operationalLocation: true,
      },
    });

    const ctx = getClientContext(req, user.id);
    await logAuditEvent({
      actorUserId: user.id,
      action: 'booking.nota_dinas_uploaded',
      entityType: 'Booking',
      entityId: id,
      newValue: {
        notaDinasUrl: publicUrl,
        notaDinasFilename: file.name,
        fileSize: file.size,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    await notifyAdmins({
      type: 'BOOKING_NOTA_DINAS_UPLOADED',
      title: 'Nota Dinas Diunggah',
      body: `Nota dinas untuk booking ${updated.bookingNumber} telah diunggah (${file.name}). Silakan verifikasi dan berikan approval.`,
      data: { bookingId: updated.id },
    });

    await publishEvent({
      type: 'booking:update',
      data: { bookingId: updated.id, status: updated.status, userId: updated.userId },
    });

    return NextResponse.json({
      data: updated,
    });
  }
);
