import { Hono } from 'hono';
import type { AppEnv, SyncPullRequest, SyncPushRequest, Asset, Tag, AssetTag, Setting } from '../types';
import { success, error } from '../utils/response';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { safeJsonParse, validateRequired, now } from '../utils/helpers';
import { checkGlobalQuota } from '../utils/rateLimit';

const sync = new Hono<AppEnv>();

/**
 * 拉取云端更新
 * POST /sync/pull
 */
sync.post('/pull', authMiddleware, async (c) => {
  const device = requireAuth(c);
  
  const body = await safeJsonParse<SyncPullRequest>(c.req.raw);
  
  if (!body) {
    return error('无效的请求数据');
  }
  
  const since = body.since || 0;
  
  try {
    console.log(`[Sync] 拉取更新: 设备=${device.device_id}, since=${since}`);
    
    // 1. 获取更新的资产（全局共享）
    const assets = await c.env.DB.prepare(`
      SELECT * FROM assets 
      WHERE updated_at > ?
      ORDER BY updated_at ASC
    `).bind(since).all<Asset>();
    
    // 2. 获取更新的标签（全局共享）
    const tags = await c.env.DB.prepare(`
      SELECT * FROM tags 
      WHERE updated_at > ?
      ORDER BY updated_at ASC
    `).bind(since).all<Tag>();
    
    // 3. 获取更新的资产-标签关联
    const assetTags = await c.env.DB.prepare(`
      SELECT * FROM asset_tags
      WHERE created_at > ?
    `).bind(since).all<AssetTag>();
    
    // 4. 获取更新的设置（全局共享）
    const settings = await c.env.DB.prepare(`
      SELECT * FROM settings 
      WHERE updated_at > ?
    `).bind(since).all<Setting>();
    
    const serverTimestamp = now();
    const totalCount = (assets.results?.length || 0) + 
                       (tags.results?.length || 0) + 
                       (assetTags.results?.length || 0) +
                       (settings.results?.length || 0);
    
    console.log(`[Sync] 拉取完成: ${totalCount} 条记录`);
    
    return success({
      assets: assets.results || [],
      tags: tags.results || [],
      asset_tags: assetTags.results || [],
      settings: settings.results || [],
      server_timestamp: serverTimestamp,
      total_count: totalCount,
    });
    
  } catch (err) {
    console.error('[Sync] 拉取失败:', err);
    return error('拉取失败', 500);
  }
});

/**
 * 调试：查看 D1 中的资产数据
 * GET /sync/debug-assets
 */
sync.get('/debug-assets', authMiddleware, async (c) => {
  const device = requireAuth(c);
  
  try {
    // 查询所有资产（全局共享）
    const assets = await c.env.DB.prepare(`
      SELECT id, file_name, r2_key, created_by_device, created_at, updated_at 
      FROM assets 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all();
    
    // 统计
    const count = await c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM assets
    `).first<{ total: number }>();
    
    console.log(`[Sync Debug] 设备 ${device.device_id} 查询到 ${count?.total || 0} 个全局资产`);
    
    return success({
      total: count?.total || 0,
      assets: assets.results || [],
    });
  } catch (err) {
    console.error('[Sync Debug] 查询失败:', err);
    return error('查询失败', 500);
  }
});

sync.post('/push', authMiddleware, async (c) => {
  const device = requireAuth(c);
  
  const body = await safeJsonParse<SyncPushRequest>(c.req.raw);
  
  if (!body) {
    return error('无效的请求数据');
  }
  
  try {
    console.log(`[Sync] 推送更新: 设备=${device.device_id}`);
    console.log(`[Sync] 收到数据: assets=${body.assets?.length || 0}, tags=${body.tags?.length || 0}`);
    
    // 检查全局配额
    const quotaCheck = await checkGlobalQuota(c.env);
    if (!quotaCheck.allowed) {
      return error(quotaCheck.reason || '超出配额限制', 403);
    }
    
    let syncedCount = 0;
    const statements: D1PreparedStatement[] = [];
    
    // 1. 推送资产（全局共享）
    if (body.assets && body.assets.length > 0) {
      console.log(`[Sync] 准备推送 ${body.assets.length} 个资产`);
      
      for (const asset of body.assets) {
        console.log(`[Sync] 🔍 处理资产: ${asset.id}`);
        
        // 检查是否有必需字段
        if (!asset.r2_key) {
          console.error(`[Sync] ❌ 跳过没有 r2_key 的资产: ${asset.id}`);
          continue;
        }
        
        console.log(`[Sync] 📝 插入资产: ${asset.id}, 创建设备=${device.device_id}`);
        
        statements.push(
          c.env.DB.prepare(`
            INSERT INTO assets (
              id, content_hash, file_name, mime_type, file_size, 
              width, height, r2_key, is_favorite, favorited_at,
              use_count, last_used_at, created_at, updated_at, deleted, deleted_at, created_by_device
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              content_hash = excluded.content_hash,
              file_name = excluded.file_name,
              mime_type = excluded.mime_type,
              file_size = excluded.file_size,
              width = excluded.width,
              height = excluded.height,
              r2_key = excluded.r2_key,
              is_favorite = excluded.is_favorite,
              favorited_at = excluded.favorited_at,
              use_count = excluded.use_count,
              last_used_at = excluded.last_used_at,
              updated_at = excluded.updated_at,
              deleted = excluded.deleted,
              deleted_at = excluded.deleted_at
          `).bind(
            asset.id, asset.content_hash, asset.file_name,
            asset.mime_type, asset.file_size, asset.width, asset.height,
            asset.r2_key, asset.is_favorite, asset.favorited_at,
            asset.use_count, asset.last_used_at, asset.created_at, asset.updated_at,
            asset.deleted, asset.deleted_at, device.device_id
          )
        );
        syncedCount++;
      }
    }
    
    // 2. 推送标签（全局共享）
    if (body.tags && body.tags.length > 0) {
      console.log(`[Sync] 准备推送 ${body.tags.length} 个标签`);
      
      for (const tag of body.tags) {
        console.log(`[Sync] 推送标签: ${tag.id}, name: ${tag.name}`);
        
        statements.push(
          c.env.DB.prepare(`
            INSERT INTO tags (id, name, color, use_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              color = excluded.color,
              use_count = excluded.use_count,
              updated_at = excluded.updated_at
          `).bind(tag.id, tag.name, tag.color, tag.use_count, tag.created_at, tag.updated_at)
        );
        syncedCount++;
      }
    }
    
    // 3. 推送资产-标签关联
    if (body.asset_tags && body.asset_tags.length > 0) {
      for (const assetTag of body.asset_tags) {
        statements.push(
          c.env.DB.prepare(`
            INSERT OR IGNORE INTO asset_tags (asset_id, tag_id, created_at)
            VALUES (?, ?, ?)
          `).bind(assetTag.asset_id, assetTag.tag_id, assetTag.created_at)
        );
        syncedCount++;
      }
    }
    
    // 4. 推送设置（全局共享）
    if (body.settings && body.settings.length > 0) {
      console.log(`[Sync] 准备推送 ${body.settings.length} 个设置`);
      
      for (const setting of body.settings) {
        console.log(`[Sync] 推送设置: ${setting.key}`);
        
        statements.push(
          c.env.DB.prepare(`
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = excluded.updated_at
          `).bind(setting.key, setting.value, setting.updated_at)
        );
        syncedCount++;
      }
    }
    
    // 逐个执行（改为非批量，方便调试）
    if (statements.length > 0) {
      console.log(`[Sync] 🔄 开始逐个执行 ${statements.length} 条 SQL 语句...`);
      
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        console.log(`[Sync] 执行 SQL #${i + 1}/${statements.length}...`);
        
        try {
          const result = await stmt.run();
          
          if (result.success) {
            successCount++;
            const rowsAffected = result.meta?.changes || 0;
            console.log(`[Sync] ✅ SQL #${i + 1} 成功: rowsAffected=${rowsAffected}`);
            
            // 如果是第一条，打印详细信息
            if (i === 0) {
              console.log(`[Sync] 🔍 第一条 SQL 的详细结果:`, {
                success: result.success,
                meta: result.meta,
                duration: result.meta?.duration
              });
            }
          } else {
            failCount++;
            console.error(`[Sync] ❌ SQL #${i + 1} 失败: success=${result.success}`);
          }
        } catch (error) {
          failCount++;
          console.error(`[Sync] ❌ SQL #${i + 1} 异常:`, error);
          console.error(`[Sync] 错误详情:`, {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      }
      
      console.log(`[Sync] 执行完成: 成功=${successCount}, 失败=${failCount}`);
      
      // 验证数据是否真的插入了
      if (body.assets && body.assets.length > 0) {
        // 1. 查询所有资产
        const allAssetsCount = await c.env.DB.prepare(`
          SELECT COUNT(*) as count FROM assets
        `).first<{ count: number }>();
        console.log(`[Sync] 🔍 D1 中所有资产总数: ${allAssetsCount?.count || 0}`);
        
        // 2. 按设备分组统计
        const byDevice = await c.env.DB.prepare(`
          SELECT created_by_device, COUNT(*) as count FROM assets GROUP BY created_by_device
        `).all();
        console.log(`[Sync] 🔍 按设备分组:`, byDevice.results);
        
        // 3. 尝试根据 ID 直接查询刚插入的资产
        if (body.assets.length > 0) {
          const firstAssetId = body.assets[0].id;
          const directQuery = await c.env.DB.prepare(`
            SELECT id, file_name, r2_key, created_by_device FROM assets WHERE id = ?
          `).bind(firstAssetId).first();
          console.log(`[Sync] 🔍 根据ID直接查询第一个资产 (${firstAssetId}):`, directQuery);
        }
        
        // 4. 查看最近的资产
        const recentAssets = await c.env.DB.prepare(`
          SELECT id, file_name, r2_key, created_by_device FROM assets ORDER BY created_at DESC LIMIT 5
        `).all();
        console.log(`[Sync] 🔍 最近的5个资产:`, recentAssets.results);
      }
    } else {
      console.log(`[Sync] ⏭️  没有数据需要推送`);
    }
    
    // 注：全局模式不需要按用户更新存储使用量
    // 存储配额可以通过查询所有资产总大小来计算
    
    const serverTimestamp = now();
    
    console.log(`[Sync] 推送完成: ${syncedCount} 条记录`);
    
    return success({
      success: true,
      synced_count: syncedCount,
      server_timestamp: serverTimestamp,
    }, '同步成功');
    
  } catch (err) {
    console.error('[Sync] 推送失败:', err);
    const errorMessage = err instanceof Error ? err.message : '推送失败';
    console.error('[Sync] 错误详情:', errorMessage);
    return error(`推送失败: ${errorMessage}`, 500);
  }
});

export default sync;
