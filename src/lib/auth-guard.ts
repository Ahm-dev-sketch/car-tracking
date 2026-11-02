import { auth } from '@/auth';
import { ApiError } from './errors';
import type { Session } from 'next-auth';

export interface AuthenticatedUser {
  id: string;
  role: string;
  name?: string | null;
  email?: string | null;
}

export async function getSessionUser(existingSession?: Session | null): Promise<AuthenticatedUser> {
  const session = existingSession !== undefined ? existingSession : await auth();

  if (!session || !session.user || !session.user.id || !session.user.role) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  return {
    id: session.user.id,
    role: session.user.role,
    name: session.user.name,
    email: session.user.email,
  };
}

export function requireRole(
  sessionOrUser: Session | AuthenticatedUser | null | undefined,
  ...allowedRoles: string[]
): AuthenticatedUser {
  if (!sessionOrUser) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const user =
    'user' in sessionOrUser && sessionOrUser.user
      ? (sessionOrUser.user as AuthenticatedUser)
      : (sessionOrUser as AuthenticatedUser);

  if (!user || !user.role) {
    throw new ApiError(403, 'FORBIDDEN', 'Insufficient permissions');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      `Insufficient permissions: required one of [${allowedRoles.join(', ')}]`
    );
  }

  return user;
}
