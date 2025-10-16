import { Hono } from 'hono';
import type { AppEnv, SyncPullRequest, SyncPushRequest, Asset, Tag, AssetTag, UserSetting } from '../types';
import { success, error } from '../utils/response';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { safeJsonParse, validateRequired, now } from '../utils/helpers';
import { checkUserQuota } from '../utils/rateLimit';

const sync = new Hono<AppEnv>();

/**
 * 拉取云端更新
 * POST /sync/pull
 */
sync.post('/pull', authMiddleware, async (c) => {
  const user = requireAuth(c);
  
  const body = await safeJsonParse<SyncPullRequest>(c.req.raw);
  
  if (!body) {
    return error('无效的请求数据');
  }
  
  const since = body.since || 0;
  
  try {
    console.log(`[Sync] 拉取更新: 用户=${user.user_id}, since=${since}`);
    
    // 1. 获取更新的资产
    const assets = await c.env.DB.prepare(`
      SELECT * FROM assets 
      WHERE user_id = ? AND updated_at > ?
      ORDER BY updated_at ASC
    `).bind(user.user_id, since).all<Asset>();
    
    // 2. 获取更新的标签
    const tags = await c.env.DB.prepare(`
      SELECT * FROM tags 
      WHERE user_id = ? AND updated_at > ?
      ORDER BY updated_at ASC
    `).bind(user.user_id, since).all<Tag>();
    
    // 3. 获取更新的资产-标签关联
    const assetTags = await c.env.DB.prepare(`
      SELECT at.* FROM asset_tags at
      JOIN assets a ON at.asset_id = a.id
      WHERE a.user_id = ? AND at.created_at > ?
    `).bind(user.user_id, since).all<AssetTag>();
    
    // 4. 获取更新的设置
    const settings = await c.env.DB.prepare(`
      SELECT * FROM user_settings 
      WHERE user_id = ? AND updated_at > ?
    `).bind(user.user_id, since).all<UserSetting>();
    
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
  const user = requireAuth(c);
  
  try {
    // 查询用户的所有资产
    const assets = await c.env.DB.prepare(`
      SELECT id, file_name, r2_key, user_id, created_at, updated_at 
      FROM assets 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 20
    `).bind(user.user_id).all();
    
    // 统计
    const count = await c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM assets WHERE user_id = ?
    `).bind(user.user_id).first<{ total: number }>();
    
    console.log(`[Sync Debug] 用户 ${user.user_id} 共有 ${count?.total || 0} 个资产`);
    
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
  const user = requireAuth(c);
  
  const body = await safeJsonParse<SyncPushRequest>(c.req.raw);
  
  if (!body) {
    return error('无效的请求数据');
  }
  
  try {
    console.log(`[Sync] 推送更新: 用户=${user.user_id}`);
    console.log(`[Sync] 收到数据: assets=${body.assets?.length || 0}, tags=${body.tags?.length || 0}`);
    
    // 检查用户配额
    const quotaCheck = await checkUserQuota(user.user_id, c.env);
    if (!quotaCheck.allowed) {
      return error(quotaCheck.reason || '超出配额限制', 403);
    }
    
    let syncedCount = 0;
    const statements: D1PreparedStatement[] = [];
    
    // 1. 推送资产
    if (body.assets && body.assets.length > 0) {
      console.log(`[Sync] 准备推送 ${body.assets.length} 个资产`);
      console.log(`[Sync] 🔍 当前用户 ID (from JWT): ${user.user_id}`);
      console.log(`[Sync] 🔍 第一个资产的 user_id: ${body.assets[0].user_id}`);
      
      for (const asset of body.assets) {
        // 验证资产属于当前用户
        if (asset.user_id !== user.user_id) {
          console.warn(`[Sync] ⚠️ 跳过非本用户资产: ${asset.id}, asset.user_id=${asset.user_id}, user.user_id=${user.user_id}`);
          continue;
        }
        
        console.log(`[Sync] 推送资产: ${asset.id}, r2_key: ${asset.r2_key || 'null'}`);
        
        // 检查是否所有必需字段都有值
        if (!asset.r2_key) {
          console.error(`[Sync] ❌ 跳过没有 r2_key 的资产: ${asset.id}`);
          continue;
        }
        
        statements.push(
          c.env.DB.prepare(`
            INSERT INTO assets (
              id, user_id, content_hash, file_name, mime_type, file_size, 
              width, height, r2_key, thumb_r2_key, is_favorite, favorited_at,
              use_count, last_used_at, created_at, updated_at, deleted, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              content_hash = excluded.content_hash,
              file_name = excluded.file_name,
              mime_type = excluded.mime_type,
              file_size = excluded.file_size,
              width = excluded.width,
              height = excluded.height,
              r2_key = excluded.r2_key,
              thumb_r2_key = excluded.thumb_r2_key,
              is_favorite = excluded.is_favorite,
              favorited_at = excluded.favorited_at,
              use_count = excluded.use_count,
              last_used_at = excluded.last_used_at,
              updated_at = excluded.updated_at,
              deleted = excluded.deleted,
              deleted_at = excluded.deleted_at
          `).bind(
            asset.id, asset.user_id, asset.content_hash, asset.file_name,
            asset.mime_type, asset.file_size, asset.width, asset.height,
            asset.r2_key, asset.thumb_r2_key, asset.is_favorite, asset.favorited_at,
            asset.use_count, asset.last_used_at, asset.created_at, asset.updated_at,
            asset.deleted, asset.deleted_at
          )
        );
        syncedCount++;
      }
    }
    
    // 2. 推送标签
    if (body.tags && body.tags.length > 0) {
      console.log(`[Sync] 准备推送 ${body.tags.length} 个标签`);
      
      for (const tag of body.tags) {
        if (tag.user_id !== user.user_id) {
          console.warn(`[Sync] 跳过非本用户标签: ${tag.id}`);
          continue;
        }
        
        console.log(`[Sync] 推送标签: ${tag.id}, name: ${tag.name}`);
        
        statements.push(
          c.env.DB.prepare(`
            INSERT INTO tags (id, user_id, name, color, use_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              color = excluded.color,
              use_count = excluded.use_count,
              updated_at = excluded.updated_at
          `).bind(tag.id, tag.user_id, tag.name, tag.color, tag.use_count, tag.created_at, tag.updated_at)
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
    
    // 4. 推送设置
    if (body.settings && body.settings.length > 0) {
      console.log(`[Sync] 准备推送 ${body.settings.length} 个设置`);
      
      for (const setting of body.settings) {
        if (setting.user_id !== user.user_id) {
          console.warn(`[Sync] 跳过非本用户设置: ${setting.key}`);
          continue;
        }
        
        statements.push(
          c.env.DB.prepare(`
            INSERT INTO user_settings (user_id, key, value, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, key) DO UPDATE SET
              value = excluded.value,
              updated_at = excluded.updated_at
          `).bind(setting.user_id, setting.key, setting.value, setting.updated_at)
        );
        syncedCount++;
      }
    }
    
    // 批量执行
    if (statements.length > 0) {
      console.log(`[Sync] 🔄 开始执行 ${statements.length} 条 SQL 语句...`);
      
      // 测试：先尝试单独执行第一条 SQL
      if (body.assets && body.assets.length > 0 && statements.length > 0) {
        console.log(`[Sync] 🧪 测试：单独执行第一条 SQL...`);
        try {
          const testResult = await statements[0].run();
          console.log(`[Sync] 🧪 测试结果:`, JSON.stringify({
            success: testResult.success,
            meta: testResult.meta,
            error: testResult.error
          }));
        } catch (testError) {
          console.error(`[Sync] 🧪 测试失败:`, testError);
        }
      }
      
      try {
        const batchResult = await c.env.DB.batch(statements);
        console.log(`[Sync] 🔍 batchResult 类型:`, typeof batchResult, Array.isArray(batchResult));
        console.log(`[Sync] 🔍 batchResult 长度:`, batchResult?.length);
        
        // 检查每条 SQL 的执行结果
        let successCount = 0;
        let failCount = 0;
        
        if (Array.isArray(batchResult)) {
          batchResult.forEach((r, idx) => {
            console.log(`[Sync] 🔍 SQL #${idx + 1} 结果:`, JSON.stringify({
              success: r.success,
              error: r.error,
              meta: r.meta,
              results: r.results?.length
            }));
            
            if (r.success) {
              successCount++;
              const rowsAffected = r.meta?.changes || r.meta?.rows_written || 0;
              console.log(`[Sync] ✅ SQL #${idx + 1} 成功: rowsAffected=${rowsAffected}`);
            } else {
              failCount++;
              console.error(`[Sync] ❌ SQL #${idx + 1} 失败:`, r.error);
            }
          });
        }
        
        console.log(`[Sync] 批量执行结果: 成功=${successCount}, 失败=${failCount}`);
        
        // 验证数据是否真的插入了
        if (body.assets && body.assets.length > 0) {
          const verifyCount = await c.env.DB.prepare(`
            SELECT COUNT(*) as count FROM assets WHERE user_id = ?
          `).bind(user.user_id).first<{ count: number }>();
          console.log(`[Sync] 🔍 验证：D1 中现在有 ${verifyCount?.count || 0} 个资产（user_id=${user.user_id}）`);
          
          // 查看刚插入的资产
          const recentAssets = await c.env.DB.prepare(`
            SELECT id, file_name, r2_key FROM assets WHERE user_id = ? ORDER BY created_at DESC LIMIT 3
          `).bind(user.user_id).all();
          console.log(`[Sync] 🔍 最近的资产:`, JSON.stringify(recentAssets.results));
        }
      } catch (batchError) {
        console.error(`[Sync] ❌ 批量执行异常:`, batchError);
        throw batchError;
      }
    } else {
      console.log(`[Sync] ⏭️  没有数据需要推送`);
    }
    
    // 更新用户存储使用量
    const totalSize = body.assets?.reduce((sum, asset) => sum + asset.file_size, 0) || 0;
    if (totalSize > 0) {
      await c.env.DB.prepare(`
        UPDATE users 
        SET storage_used = storage_used + ?
        WHERE user_id = ?
      `).bind(totalSize, user.user_id).run();
    }
    
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
