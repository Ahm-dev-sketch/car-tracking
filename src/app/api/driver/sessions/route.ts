import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { startDriverSessionSchema } from '@/lib/validation';
import { startDriverSession, endDriverSession, getActiveDriverSession } from '@/server/dispatch/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  try {
    const user = await getSessionUser();
    requireRole(user, 'DRIVER');

    const driver = await prisma.driver.findUnique({
      where: { userId: user.id },
    });

    if (!driver) {
      throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
    }

    const session = await getActiveDriverSession(driver.id);
    return NextResponse.json({ success: true, data: session });
  } catch (error: unknown) {
    console.error('[Driver Session Error]:', error);
    if (error instanceof ApiError) throw error;
    return NextResponse.json({ success: true, data: null });
  }
});

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest) => {
    try {
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

      return NextResponse.json({ success: true, data: session }, { status: 201 });
    } catch (error: unknown) {
      console.error('[Driver Session Error]:', error);
      if (error instanceof ApiError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
            message: error.message,
          },
          { status: error.status }
        );
      }
      const message = error instanceof Error ? error.message : 'Failed to start driver session';
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SESSION_START_FAILED',
            message,
          },
          message,
        },
        { status: 400 }
      );
    }
  }),
  RATE_LIMIT_CONFIG.DRIVER_SESSION
);

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  try {
    const user = await getSessionUser();
    requireRole(user, 'DRIVER');

    const driver = await prisma.driver.findUnique({
      where: { userId: user.id },
    });

    if (!driver) {
      throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
    }

    const ctx = getClientContext(req, user.id);
    const ended = await endDriverSession(driver.id, {
      actorUserId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return NextResponse.json({ success: true, data: ended });
  } catch (error: unknown) {
    console.error('[Driver Session Error]:', error);
    if (error instanceof ApiError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
          message: error.message,
        },
        { status: error.status }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to end driver session';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SESSION_END_FAILED',
          message,
        },
        message,
      },
      { status: 400 }
    );
  }
});
