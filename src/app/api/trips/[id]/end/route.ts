import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { getClientContext } from '@/lib/request-context';
import { endTripSchema } from '@/lib/validation';
import { endTrip } from '@/server/trips/service';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';

export const PATCH = withErrorHandling(
  async (req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'DRIVER');

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing trip id' } },
        { status: 400 }
      );
    }

    const driver = await prisma.driver.findUnique({
      where: { userId: user.id },
    });
    if (!driver) {
      throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
    }

    let parsedBody = {};
    try {
      parsedBody = await req.json();
    } catch {
      // Body is optional
    }

    const validated = endTripSchema.parse(parsedBody);
    const ctx = getClientContext(req, user.id);
    const completed = await endTrip(driver.id, id, validated, ctx);

    return NextResponse.json({ data: completed });
  }
);
