import { Hono } from 'hono';
import type { AppEnv, QuotaInfo } from '../types';
import { success, error } from '../utils/response';
import { requireAuth } from '../middleware/auth';
import { RATE_LIMITS } from '../utils/rateLimit';

const quota = new Hono<AppEnv>();

/**
 * 获取配额信息
 * GET /quota/info
 */
quota.get('/info', async (c) => {
  const user = requireAuth(c);
  
  try {
    // 1. 获取资产数量
    const assetCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM assets WHERE user_id = ? AND deleted = 0'
    ).bind(user.user_id).first<{ count: number }>();
    
    // 2. 获取存储使用量
    const userInfo = await c.env.DB.prepare(
      'SELECT storage_used FROM users WHERE user_id = ?'
    ).bind(user.user_id).first<{ storage_used: number }>();
    
    // 3. 获取分享数量
    const shareCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM shares WHERE user_id = ?'
    ).bind(user.user_id).first<{ count: number }>();
    
    const quotaInfo: QuotaInfo = {
      assets: {
        used: assetCount?.count || 0,
        limit: RATE_LIMITS.maxAssetsPerUser,
        percentage: Math.round(((assetCount?.count || 0) / RATE_LIMITS.maxAssetsPerUser) * 100),
      },
      storage: {
        used: userInfo?.storage_used || 0,
        limit: RATE_LIMITS.maxStoragePerUser,
        percentage: Math.round(((userInfo?.storage_used || 0) / RATE_LIMITS.maxStoragePerUser) * 100),
      },
      shares: {
        used: shareCount?.count || 0,
        limit: RATE_LIMITS.maxSharesPerUser,
        percentage: Math.round(((shareCount?.count || 0) / RATE_LIMITS.maxSharesPerUser) * 100),
      },
    };
    
    return success(quotaInfo);
    
  } catch (err) {
    console.error('[Quota] 获取配额信息失败:', err);
    return error('获取配额信息失败', 500);
  }
});

export default quota;
