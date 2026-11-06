import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { getClientContext } from '@/lib/request-context';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/server/audit';
import { notify } from '@/server/notifications/service';
import { publishEvent } from '@/server/realtime/hub';
import { BookingStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(
  async (req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      throw new ApiError(400, 'INVALID_ID', 'Missing booking id');
    }

    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!reason) {
      throw new ApiError(400, 'REASON_REQUIRED', 'Alasan penolakan nota dinas wajib diisi');
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        driver: { include: { user: { select: { id: true, name: true, phone: true } } } },
        vehicle: true,
        operationalLocation: true,
      },
    });

    if (!booking) {
      throw new ApiError(404, 'NOT_FOUND', 'Booking not found');
    }

    if (booking.status !== BookingStatus.PENDING_COMPLETION) {
      throw new ApiError(
        400,
        'INVALID_STATUS',
        `Hanya booking berstatus PENDING_COMPLETION yang dapat ditolak nota dinasnya (status saat ini: ${booking.status})`
      );
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        rejectedReason: reason,
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
      action: 'booking.nota_dinas_rejected',
      entityType: 'Booking',
      entityId: id,
      newValue: {
        rejectedReason: reason,
        notaDinasUrl: booking.notaDinasUrl,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    await notify(booking.userId, {
      type: 'BOOKING_NOTA_DINAS_REJECTED',
      title: 'Nota Dinas Ditolak',
      body: `Nota dinas booking ${booking.bookingNumber} ditolak admin: "${reason}". Silakan unggah dokumen yang valid.`,
      data: { bookingId: booking.id, reason },
    });

    if (booking.driver?.userId) {
      await notify(booking.driver.userId, {
        type: 'BOOKING_NOTA_DINAS_REJECTED',
        title: 'Nota Dinas Ditolak',
        body: `Nota dinas booking ${booking.bookingNumber} ditolak admin: "${reason}".`,
        data: { bookingId: booking.id, reason },
      });
    }

    await publishEvent({
      type: 'booking:update',
      data: { bookingId: updated.id, status: updated.status, userId: updated.userId },
    });

    return NextResponse.json({ data: updated });
  }
);
