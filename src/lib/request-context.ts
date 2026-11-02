import { NextRequest } from 'next/server';
import { getClientIp } from './rate-limit';

export function getClientContext(req: NextRequest, actorUserId?: string | null) {
  return {
    actorUserId: actorUserId ?? null,
    ip: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  };
}
