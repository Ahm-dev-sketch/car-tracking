import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { createUserSchema, userQuerySchema } from '@/lib/validation';
import { createUser, listUsers } from '@/server/users/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  requireRole(user, 'ADMIN');

  const { searchParams } = new URL(req.url);
  const query = userQuerySchema.parse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  });

  const result = await listUsers(query);
  return NextResponse.json(result);
});

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const body = await req.json();
    const validated = createUserSchema.parse(body);

    const roleId = validated.role_id ?? validated.roleId;
    const ctx = getClientContext(req, user.id);
    const created = await createUser(
      {
        email: validated.email,
        name: validated.name,
        phone: validated.phone,
        password: validated.password,
        roleId: roleId!,
      },
      ctx
    );

    return NextResponse.json({ data: created }, { status: 201 });
  }),
  RATE_LIMIT_CONFIG.ADMIN_MUTATION
);
