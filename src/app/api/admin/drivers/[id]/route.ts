import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { getClientContext } from '@/lib/request-context';
import { updateDriverSchema } from '@/lib/validation';
import { updateDriver, deactivateDriver } from '@/server/drivers/service';

export const PATCH = withErrorHandling(
  async (req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing driver id' } },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validated = updateDriverSchema.parse(body);

    const ctx = getClientContext(req, user.id);
    const updated = await updateDriver(id, validated, ctx);

    return NextResponse.json({ data: updated });
  }
);

export const DELETE = withErrorHandling(
  async (req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing driver id' } },
        { status: 400 }
      );
    }

    const ctx = getClientContext(req, user.id);
    const deactivated = await deactivateDriver(id, ctx);

    return NextResponse.json({
      data: deactivated,
      message: 'Driver deactivated',
    });
  }
);
