import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { success, error } from '../utils/response';
import { authMiddleware, requireAuth } from '../middleware/auth';

const consistency = new Hono<AppEnv>();

/**
 * 检查 R2 孤儿文件
 * POST /consistency/check-orphans
 * 
 * 找出 R2 中存在，但 D1 中没有记录的文件
 */
consistency.post('/check-orphans', authMiddleware, async (c) => {
  const device = requireAuth(c);
  
  try {
    console.log(`[Consistency] 检查 R2 孤儿文件: device=${device.device_id}`);
    
    // 1. 获取 R2 的所有文件（全局）
    const r2Files: { key: string; size: number; uploaded: Date }[] = [];
    
    const listed = await c.env.R2.list();
    
    for (const object of listed.objects) {
      r2Files.push({
        key: object.key,
        size: object.size,
        uploaded: object.uploaded
      });
    }
    
    console.log(`[Consistency] R2 文件总数: ${r2Files.length}`);
    
    // 2. 从 D1 查询所有 r2_key（全局，仅原图）
    const assetsResult = await c.env.DB.prepare(`
      SELECT r2_key
      FROM assets 
      WHERE r2_key IS NOT NULL
    `).all();
    
    const d1Keys = new Set<string>();
    for (const row of assetsResult.results) {
      if (row.r2_key) d1Keys.add(row.r2_key as string);
    }
    
    console.log(`[Consistency] D1 记录的 r2_key 数量: ${d1Keys.size}`);
    
    // 3. 找出孤儿文件（在 R2 但不在 D1）
    const orphans = r2Files.filter(file => !d1Keys.has(file.key));
    
    const orphanSize = orphans.reduce((sum, file) => sum + file.size, 0);
    
    console.log(`[Consistency] 孤儿文件数量: ${orphans.length}, 总大小: ${orphanSize} bytes`);
    
    return success({
      orphans: orphans.map(f => ({
        r2_key: f.key,
        size: f.size,
        uploaded: f.uploaded
      })),
      summary: {
        total_r2_files: r2Files.length,
        total_d1_keys: d1Keys.size,
        orphan_count: orphans.length,
        orphan_size_bytes: orphanSize
      }
    });
    
  } catch (err) {
    console.error('[Consistency] 检查孤儿文件失败:', err);
    return error('检查孤儿文件失败', 500);
  }
});

/**
 * 检查 D1 数据库的文件完整性
 * POST /consistency/check-d1-files
 * 
 * 检查 D1 中记录的 r2_key 是否在 R2 中真实存在
 */
consistency.post('/check-d1-files', authMiddleware, async (c) => {
  const device = requireAuth(c);
  
  try {
    console.log(`[Consistency] 检查 D1 文件完整性: device=${device.device_id}`);
    
    // 1. 查询 D1 中所有资产（全局）
    const assetsResult = await c.env.DB.prepare(`
      SELECT id, r2_key
      FROM assets 
      WHERE r2_key IS NOT NULL AND deleted = 0
      ORDER BY created_at DESC
    `).all();
    
    console.log(`[Consistency] 资产数量: ${assetsResult.results.length}`);
    
    // 2. 检查每个资产的文件是否存在（仅原图）
    const keysToCheck: Array<{
      assetId: string;
      r2Key: string;
      type: 'main';
    }> = [];
    
    for (const row of assetsResult.results) {
      if (row.r2_key) {
        keysToCheck.push({
          assetId: row.id as string,
          r2Key: row.r2_key as string,
          type: 'main'
        });
      }
    }
    
    console.log(`[Consistency] 需要检查的 r2_key 数量: ${keysToCheck.length}`);
    
    // 3. 批量检查（每批 100 个）
    const BATCH_SIZE = 100;
    const missing: typeof keysToCheck = [];
    
    for (let i = 0; i < keysToCheck.length; i += BATCH_SIZE) {
      const batch = keysToCheck.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.all(
        batch.map(async (item) => {
          try {
            const object = await c.env.R2.head(item.r2Key);
            return { ...item, exists: object !== null };
          } catch (err) {
            return { ...item, exists: false };
          }
        })
      );
      
      missing.push(...results.filter(r => !r.exists));
    }
    
    console.log(`[Consistency] 检查完成: ${missing.length}/${keysToCheck.length} 缺失`);
    
    // 4. 整理缺失的资产列表（仅原图）
    const missingAssets = missing.map(item => ({
      asset_id: item.assetId,
      r2_key: item.r2Key
    }));
    
    return success({
      missing: missingAssets,
      summary: {
        total_assets: assetsResult.results.length,
        total_keys: keysToCheck.length,
        missing_count: missing.length,
        affected_assets: missingAssets.length
      }
    });
    
  } catch (err) {
    console.error('[Consistency] 检查 D1 文件完整性失败:', err);
    return error('检查 D1 文件完整性失败', 500);
  }
});

/**
 * 获取所有资产数据（用于前端对比）
 * POST /consistency/get-cloud-assets
 * 
 * 返回云端所有资产数据，供前端与本地数据对比
 */
consistency.post('/get-cloud-assets', authMiddleware, async (c) => {
  const device = requireAuth(c);
  
  try {
    console.log(`[Consistency] 获取云端资产: device=${device.device_id}`);
    
    // 查询所有资产（全局共享）
    const assetsResult = await c.env.DB.prepare(`
      SELECT 
        id, file_name, content_hash, r2_key,
        file_size, mime_type, width, height,
        is_favorite, favorited_at, use_count, last_used_at,
        created_at, updated_at, deleted, deleted_at, created_by_device
      FROM assets 
      ORDER BY created_at DESC
    `).all();
    
    console.log(`[Consistency] 云端资产数量: ${assetsResult.results.length}`);
    
    // 按设备分组统计
    const byDevice = await c.env.DB.prepare(`
      SELECT created_by_device, COUNT(*) as count
      FROM assets
      GROUP BY created_by_device
    `).all();
    console.log(`[Consistency] 🔍 按设备分组:`, byDevice.results);
    
    return success({
      assets: assetsResult.results,
      summary: {
        total: assetsResult.results.length,
        deleted: assetsResult.results.filter((a: any) => a.deleted === 1).length,
        with_r2: assetsResult.results.filter((a: any) => a.r2_key).length
      }
    });
    
  } catch (err) {
    console.error('[Consistency] 获取云端资产失败:', err);
    return error('获取云端资产失败', 500);
  }
});

export default consistency;
