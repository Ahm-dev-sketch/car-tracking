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
    const user = await getSessionUser();
    requireRole(user, 'DRIVER');

    const driver = await prisma.driver.findUnique({
      where: { userId: user.id },
    });
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
      if (error instanceof ApiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Database error while ingesting locations';
      throw new ApiError(500, 'TRACKING_INGEST_ERROR', message);
    }
  }),
  RATE_LIMIT_CONFIG.LOCATION_INGEST
);
