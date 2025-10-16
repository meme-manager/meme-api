import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { getClientIp, checkIpRateLimit } from '../utils/rateLimit';
import { tooManyRequests } from '../utils/response';

/**
 * IP 限流中间件
 */
export async function rateLimitMiddleware(c: Context<AppEnv>, next: () => Promise<void>) {
  const ip = getClientIp(c.req.raw);
  
  const result = await checkIpRateLimit(ip, c.env);
  
  if (!result.allowed) {
    return tooManyRequests(result.reason);
  }
  
  await next();
}
