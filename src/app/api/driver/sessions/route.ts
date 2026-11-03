import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { startDriverSessionSchema } from '@/lib/validation';
import { startDriverSession, getActiveDriverSession } from '@/server/dispatch/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();
  requireRole(user, 'DRIVER');

  const driver = await prisma.driver.findUnique({
    where: { userId: user.id },
  });

  if (!driver) {
    throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
  }

  const session = await getActiveDriverSession(driver.id);
  return NextResponse.json({ data: session });
});

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest) => {
    const user = await getSessionUser();
    requireRole(user, 'DRIVER');

    const driver = await prisma.driver.findUnique({
      where: { userId: user.id },
    });

    if (!driver) {
      throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is valid
    }

    const validated = startDriverSessionSchema.parse(body);
    const ctx = getClientContext(req, user.id);

    const session = await startDriverSession(driver.id, validated, {
      actorUserId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return NextResponse.json({ data: session }, { status: 201 });
  }),
  RATE_LIMIT_CONFIG.DRIVER_SESSION
);
