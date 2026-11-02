import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { updateUserSchema } from '@/lib/validation';
import { updateUser } from '@/server/users/service';

export const PATCH = withErrorHandling(
  async (req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing user id' } },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validated = updateUserSchema.parse(body);

    const isActive =
      validated.is_active !== undefined ? validated.is_active : validated.isActive;

    const updated = await updateUser(
      id,
      {
        isActive,
        password: validated.password,
      },
      user.id
    );

    return NextResponse.json({ data: updated });
  }
);
