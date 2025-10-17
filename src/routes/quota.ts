import { Hono } from 'hono';
import type { AppEnv, QuotaInfo } from '../types';
import { success, error } from '../utils/response';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { RATE_LIMITS } from '../utils/rateLimit';

const quota = new Hono<AppEnv>();

/**
 * 获取全局配额信息
 * GET /quota/info
 */
quota.get('/info', authMiddleware, async (c) => {
  const device = requireAuth(c);
  
  try {
    console.log(`[Quota] 获取全局配额信息: device=${device.device_id}`);
    
    // 1. 获取全局资产数量
    const assetCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM assets WHERE deleted = 0'
    ).first<{ count: number }>();
    
    // 2. 获取全局存储使用量
    const storageResult = await c.env.DB.prepare(
      'SELECT SUM(file_size) as total FROM assets WHERE deleted = 0'
    ).first<{ total: number }>();
    
    // 3. 获取全局分享数量
    const shareCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM shares'
    ).first<{ count: number }>();
    
    const storageUsed = storageResult?.total || 0;
    
    const quotaInfo: QuotaInfo = {
      assets: {
        used: assetCount?.count || 0,
        limit: RATE_LIMITS.maxAssets,
        percentage: Math.round(((assetCount?.count || 0) / RATE_LIMITS.maxAssets) * 100),
      },
      storage: {
        used: storageUsed,
        limit: RATE_LIMITS.maxStorage,
        percentage: Math.round((storageUsed / RATE_LIMITS.maxStorage) * 100),
      },
      shares: {
        used: shareCount?.count || 0,
        limit: RATE_LIMITS.maxShares,
        percentage: Math.round(((shareCount?.count || 0) / RATE_LIMITS.maxShares) * 100),
      },
    };
    
    return success(quotaInfo);
    
  } catch (err) {
    console.error('[Quota] 获取配额信息失败:', err);
    return error('获取配额信息失败', 500);
  }
});

export default quota;
