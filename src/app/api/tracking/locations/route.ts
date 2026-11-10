import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { locationIngestSchema, locationPointSchema } from '@/lib/validation';
import { ingestLocations, LocationPointInput } from '@/server/tracking/service';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest) => {
    let user;
    try {
      user = await getSessionUser();
      requireRole(user, 'DRIVER');
    } catch (authErr) {
      if (authErr instanceof ApiError && (authErr.status === 401 || authErr.status === 403)) {
        throw authErr;
      }
      return NextResponse.json(
        { success: false, buffered: true, data: { accepted: 0, rejected: [] }, warning: 'Database busy' },
        { status: 200 }
      );
    }

    let driver = null;
    try {
      driver = await prisma.driver.findUnique({
        where: { userId: user.id },
      });
    } catch (dbErr: unknown) {
      console.warn('[Tracking Location DB Busy]:', dbErr);
      return NextResponse.json(
        { success: false, buffered: true, data: { accepted: 0, rejected: [] }, warning: 'Database busy' },
        { status: 200 }
      );
    }

    if (!driver) {
      throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
    }

    const body = await req.json();
    const validated = locationIngestSchema.parse(body);

    const parsedPoints: LocationPointInput[] = [];
    const originalIndexes: number[] = [];
    const rejected: Array<{ index: number; reason: string }> = [];

    for (let i = 0; i < validated.points.length; i++) {
      const parsed = locationPointSchema.safeParse(validated.points[i]);
      if (!parsed.success) {
        rejected.push({
          index: i,
          reason: parsed.error.issues[0]?.message ?? 'Invalid point payload',
        });
      } else {
        parsedPoints.push(parsed.data);
        originalIndexes.push(i);
      }
    }

    try {
      const ingestResult = await ingestLocations(driver.id, parsedPoints);

      return NextResponse.json({
        success: true,
        data: {
          accepted: ingestResult.accepted,
          rejected: [
            ...rejected,
            ...ingestResult.rejected.map((point) => ({
              ...point,
              index: originalIndexes[point.index],
            })),
          ].sort((a, b) => a.index - b.index),
        },
      });
    } catch (error: unknown) {
      console.error('[Tracking Location Error]:', error);
      if (error instanceof ApiError && error.status < 500) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      const isConnectionIssue =
        message.includes('EMAXCONNSESSION') ||
        message.includes('pool_size') ||
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('terminat') ||
        message.includes('client') ||
        message.includes('busy');

      if (isConnectionIssue) {
        console.warn('[Tracking Location Ingest]: Connection pool busy, returning buffered 200 response');
        return NextResponse.json(
          {
            success: false,
            buffered: true,
            data: { accepted: 0, rejected: [] },
            warning: 'Database busy',
          },
          { status: 200 }
        );
      }
      throw new ApiError(500, 'TRACKING_INGEST_ERROR', message);
    }
  }),
  RATE_LIMIT_CONFIG.LOCATION_INGEST
);
