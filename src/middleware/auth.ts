import type { Context } from 'hono';
import type { AppEnv, JWTPayload } from '../types';
import { extractToken, verifyToken } from '../utils/jwt';
import { unauthorized } from '../utils/response';

/**
 * 认证中间件
 */
export async function authMiddleware(c: Context<AppEnv>, next: () => Promise<void>) {
  const token = extractToken(c.req.raw);
  
  if (!token) {
    return unauthorized('缺少认证令牌');
  }
  
  // 获取 JWT 密钥（从环境变量或生成默认密钥）
  const secret = c.env.JWT_SECRET || 'default-secret-change-in-production';
  
  const payload = await verifyToken(token, secret);
  
  if (!payload) {
    return unauthorized('无效的认证令牌');
  }
  
  // 检查令牌是否过期
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return unauthorized('认证令牌已过期');
  }
  
  // 将设备信息存储到上下文中
  c.set('device', payload);
  
  await next();
}

/**
 * 可选认证中间件（允许未认证的请求通过）
 */
export async function optionalAuthMiddleware(c: Context<AppEnv>, next: () => Promise<void>) {
  const token = extractToken(c.req.raw);
  
  if (token) {
    const secret = c.env.JWT_SECRET || 'default-secret-change-in-production';
    const payload = await verifyToken(token, secret);
    
    if (payload && payload.exp >= Math.floor(Date.now() / 1000)) {
      c.set('device', payload);
    }
  }
  
  await next();
}

/**
 * 从上下文中获取当前设备
 */
export function getCurrentDevice(c: Context): JWTPayload | null {
  return c.get('device') || null;
}

/**
 * 要求认证的辅助函数
 */
export function requireAuth(c: Context): JWTPayload {
  const device = getCurrentDevice(c);
  
  if (!device) {
    throw new Error('未认证');
  }
  
  return device;
}
