import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { getClientContext } from '@/lib/request-context';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { acceptOffer } from '@/server/dispatch/service';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'DRIVER');

    const driver = await prisma.driver.findUnique({
      where: { userId: user.id },
    });

    if (!driver) {
      throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
    }

    const { id: offerId } = await params;
    const ctx = getClientContext(req, user.id);

    const result = await acceptOffer(driver.id, offerId, {
      actorUserId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return NextResponse.json(result);
  }
);
