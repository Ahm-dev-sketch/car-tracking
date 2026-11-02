import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { updateVehicleSchema } from '@/lib/validation';
import { getVehicleById, updateVehicle, deleteVehicle } from '@/server/vehicles/service';

export const GET = withErrorHandling(
  async (_req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    await getSessionUser();

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing vehicle id' } },
        { status: 400 }
      );
    }

    const vehicle = await getVehicleById(id);
    return NextResponse.json({ data: vehicle });
  }
);

export const PATCH = withErrorHandling(
  async (req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing vehicle id' } },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validated = updateVehicleSchema.parse(body);

    const vehicle = await updateVehicle(id, validated, user.id);
    return NextResponse.json({ data: vehicle });
  }
);

export const DELETE = withErrorHandling(
  async (_req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing vehicle id' } },
        { status: 400 }
      );
    }

    const vehicle = await deleteVehicle(id, user.id);
    return NextResponse.json({ data: vehicle, message: 'Vehicle deactivated' });
  }
);
