import { handlers } from '@/auth';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';

export const GET = handlers.GET;
export const POST = withRateLimit(handlers.POST, RATE_LIMIT_CONFIG.LOGIN);
