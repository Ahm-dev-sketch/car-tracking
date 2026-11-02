import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { assignVehicleSchema } from '@/lib/validation';
import { assignVehicle } from '@/server/assignments/service';

export const POST = withRateLimit(
  withErrorHandling(
    async (req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
      const user = await getSessionUser();
      requireRole(user, 'ADMIN');

      const params = await context?.params;
      const driverId = params?.id;
      if (!driverId) {
        return NextResponse.json(
          { error: { code: 'INVALID_ID', message: 'Missing driver id' } },
          { status: 400 }
        );
      }

      const body = await req.json();
      const validated = assignVehicleSchema.parse(body);

      const ctx = getClientContext(req, user.id);
      const assignment = await assignVehicle(driverId, validated.vehicleId, ctx);

      return NextResponse.json({ data: assignment }, { status: 201 });
    }
  ),
  RATE_LIMIT_CONFIG.ASSIGNMENT
);
