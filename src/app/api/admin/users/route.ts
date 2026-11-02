import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
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

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  requireRole(user, 'ADMIN');

  const body = await req.json();
  const validated = createUserSchema.parse(body);

  const roleId = validated.role_id ?? validated.roleId;
  const created = await createUser(
    {
      email: validated.email,
      name: validated.name,
      phone: validated.phone,
      password: validated.password,
      roleId: roleId!,
    },
    user.id
  );

  return NextResponse.json({ data: created }, { status: 201 });
});
