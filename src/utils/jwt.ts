import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from '../types';

/**
 * 生成 JWT Token
 */
export async function generateToken(
  payload: Omit<JWTPayload, 'exp'>,
  secret: string,
  expiresIn: number = 30 * 24 * 60 * 60 // 30天
): Promise<string> {
  const encoder = new TextEncoder();
  const secretKey = encoder.encode(secret);
  
  const token = await new SignJWT({
    user_id: payload.user_id,
    device_id: payload.device_id,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(secretKey);
  
  return token;
}

/**
 * 验证 JWT Token
 */
export async function verifyToken(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  try {
    const encoder = new TextEncoder();
    const secretKey = encoder.encode(secret);
    
    const { payload } = await jwtVerify(token, secretKey);
    
    return {
      user_id: payload.user_id as string,
      device_id: payload.device_id as string,
      exp: payload.exp as number,
    };
  } catch (error) {
    console.error('[JWT] 验证失败:', error);
    return null;
  }
}

/**
 * 从请求头中提取 Token
 */
export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.substring(7);
}

/**
 * 生成随机密钥（用于 JWT_SECRET）
 */
export function generateSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}
