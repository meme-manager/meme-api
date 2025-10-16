import type { CloudflareBindings, RateLimitConfig } from '../types';

/**
 * 限流配置
 */
export const RATE_LIMITS: RateLimitConfig = {
  maxAssetsPerUser: 2000,
  maxStoragePerUser: 1024 * 1024 * 1024, // 1GB
  maxSharesPerUser: 100,
  maxSharesPerDay: 10,
  maxRequestsPerIpPerHour: 1000,
  maxShareViewsPerIpPerHour: 100,
  maxViewsPerShare: 10000,
  maxDownloadsPerShare: 1000,
};

/**
 * 检查用户配额
 */
export async function checkUserQuota(
  userId: string,
  env: CloudflareBindings
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // 1. 检查图片数量
    const assetCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM assets WHERE user_id = ? AND deleted = 0'
    ).bind(userId).first<{ count: number }>();
    
    if (assetCount && assetCount.count >= RATE_LIMITS.maxAssetsPerUser) {
      return {
        allowed: false,
        reason: `已达到最大图片数量限制（${RATE_LIMITS.maxAssetsPerUser}张）`
      };
    }
    
    // 2. 检查存储空间
    const user = await env.DB.prepare(
      'SELECT storage_used FROM users WHERE user_id = ?'
    ).bind(userId).first<{ storage_used: number }>();
    
    if (user && user.storage_used >= RATE_LIMITS.maxStoragePerUser) {
      return {
        allowed: false,
        reason: `存储空间已满（${formatBytes(RATE_LIMITS.maxStoragePerUser)}）`
      };
    }
    
    // 3. 检查分享数量
    const shareCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM shares WHERE user_id = ?'
    ).bind(userId).first<{ count: number }>();
    
    if (shareCount && shareCount.count >= RATE_LIMITS.maxSharesPerUser) {
      return {
        allowed: false,
        reason: `已达到最大分享数量限制（${RATE_LIMITS.maxSharesPerUser}个）`
      };
    }
    
    return { allowed: true };
  } catch (error) {
    console.error('[RateLimit] 检查用户配额失败:', error);
    return { allowed: true }; // 出错时允许通过
  }
}

/**
 * 检查每日分享创建限制
 */
export async function checkDailyShareLimit(
  userId: string,
  env: CloudflareBindings
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM shares 
      WHERE user_id = ? 
      AND DATE(created_at/1000, 'unixepoch') = ?
    `).bind(userId, today).first<{ count: number }>();
    
    if (result && result.count >= RATE_LIMITS.maxSharesPerDay) {
      return {
        allowed: false,
        reason: `今日分享创建次数已达上限（${RATE_LIMITS.maxSharesPerDay}次）`
      };
    }
    
    return { allowed: true };
  } catch (error) {
    console.error('[RateLimit] 检查每日分享限制失败:', error);
    return { allowed: true };
  }
}

/**
 * IP 级别限流
 */
export async function checkIpRateLimit(
  ip: string,
  env: CloudflareBindings
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // 如果没有配置 KV,跳过限流检查
    if (!env.KV) {
      console.log('[RateLimit] KV 未配置,跳过 IP 限流检查');
      return { allowed: true };
    }

    const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const key = `ip:${ip}:${hour}`;
    
    const count = await env.KV.get(key);
    const currentCount = count ? parseInt(count) : 0;
    
    if (currentCount >= RATE_LIMITS.maxRequestsPerIpPerHour) {
      return {
        allowed: false,
        reason: '请求过于频繁，请稍后再试'
      };
    }
    
    // 增加计数，1小时后过期
    await env.KV.put(key, (currentCount + 1).toString(), {
      expirationTtl: 3600
    });
    
    return { allowed: true };
  } catch (error) {
    console.error('[RateLimit] IP 限流检查失败:', error);
    return { allowed: true };
  }
}

/**
 * 检查分享查看限制
 */
export async function checkShareViewLimit(
  shareId: string,
  ip: string,
  env: CloudflareBindings
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // 如果没有配置 KV,只检查分享总查看次数
    if (!env.KV) {
      console.log('[RateLimit] KV 未配置,跳过 IP 级别的分享查看限流');
      
      // 仍然检查分享总查看次数
      const share = await env.DB.prepare(
        'SELECT view_count FROM shares WHERE share_id = ?'
      ).bind(shareId).first<{ view_count: number }>();
      
      if (share && share.view_count >= RATE_LIMITS.maxViewsPerShare) {
        return {
          allowed: false,
          reason: '该分享已达到最大查看次数'
        };
      }
      
      return { allowed: true };
    }

    // 1. 检查 IP 每小时查看分享次数
    const hour = new Date().toISOString().slice(0, 13);
    const ipKey = `share-view:${ip}:${hour}`;
    
    const ipCount = await env.KV.get(ipKey);
    const currentIpCount = ipCount ? parseInt(ipCount) : 0;
    
    if (currentIpCount >= RATE_LIMITS.maxShareViewsPerIpPerHour) {
      return {
        allowed: false,
        reason: '查看分享过于频繁，请稍后再试'
      };
    }
    
    // 2. 检查分享总查看次数
    const share = await env.DB.prepare(
      'SELECT view_count FROM shares WHERE share_id = ?'
    ).bind(shareId).first<{ view_count: number }>();
    
    if (share && share.view_count >= RATE_LIMITS.maxViewsPerShare) {
      return {
        allowed: false,
        reason: '该分享已达到最大查看次数'
      };
    }
    
    // 增加 IP 计数
    await env.KV.put(ipKey, (currentIpCount + 1).toString(), {
      expirationTtl: 3600
    });
    
    return { allowed: true };
  } catch (error) {
    console.error('[RateLimit] 检查分享查看限制失败:', error);
    return { allowed: true };
  }
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * 获取客户端 IP
 */
export function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 
         request.headers.get('X-Forwarded-For')?.split(',')[0] || 
         'unknown';
}
