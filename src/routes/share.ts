import { Hono } from 'hono';
import type { AppEnv, CreateShareRequest, Share, Asset } from '../types';
import { success, error, notFound } from '../utils/response';
import { requireAuth } from '../middleware/auth';
import { safeJsonParse, validateRequired, now, generateShortId, hashPassword, verifyPassword } from '../utils/helpers';
import { checkUserQuota, checkDailyShareLimit, checkShareViewLimit, getClientIp } from '../utils/rateLimit';

const share = new Hono<AppEnv>();

/**
 * 创建分享
 * POST /share/create
 */
share.post('/create', async (c) => {
  const user = requireAuth(c);
  
  const body = await safeJsonParse<CreateShareRequest>(c.req.raw);
  
  if (!body) {
    return error('无效的请求数据');
  }
  
  // 验证必填字段
  const validation = validateRequired(body, ['asset_ids']);
  if (!validation.valid) {
    return error(`缺少必填字段: ${validation.missing?.join(', ')}`);
  }
  
  if (!body.asset_ids || body.asset_ids.length === 0) {
    return error('至少需要选择一个资产');
  }
  
  try {
    // 检查配额
    const quotaCheck = await checkUserQuota(user.user_id, c.env);
    if (!quotaCheck.allowed) {
      return error(quotaCheck.reason || '超出配额限制', 403);
    }
    
    // 检查每日分享限制
    const dailyCheck = await checkDailyShareLimit(user.user_id, c.env);
    if (!dailyCheck.allowed) {
      return error(dailyCheck.reason || '超出每日分享限制', 403);
    }
    
    const shareId = generateShortId(8);
    const timestamp = now();
    const expiresAt = body.expires_in ? timestamp + body.expires_in * 1000 : null;
    const passwordHash = body.password ? await hashPassword(body.password) : null;
    
    console.log(`[Share] 创建分享: ${shareId}, 用户=${user.user_id}, 资产数=${body.asset_ids.length}`);
    
    // 1. 验证所有资产都属于当前用户
    const assetCheckResults = await Promise.all(
      body.asset_ids.map(assetId =>
        c.env.DB.prepare(
          'SELECT id, user_id, content_hash, file_name, mime_type, width, height, r2_key FROM assets WHERE id = ? AND user_id = ? AND deleted = 0'
        ).bind(assetId, user.user_id).first<Asset>()
      )
    );
    
    const validAssets = assetCheckResults.filter(a => a !== null) as Asset[];
    
    if (validAssets.length === 0) {
      return error('没有找到有效的资产');
    }
    
    if (validAssets.length !== body.asset_ids.length) {
      console.warn(`[Share] 部分资产无效: 请求=${body.asset_ids.length}, 有效=${validAssets.length}`);
    }
    
    // 2. 创建分享记录
    await c.env.DB.prepare(`
      INSERT INTO shares (
        share_id, user_id, title, description, expires_at, max_downloads, 
        password_hash, view_count, download_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `).bind(
      shareId, user.user_id, body.title || null, body.description || null,
      expiresAt, body.max_downloads || null, passwordHash, timestamp, timestamp
    ).run();
    
    // 3. 关联资产
    const statements: D1PreparedStatement[] = [];
    for (let i = 0; i < validAssets.length; i++) {
      statements.push(
        c.env.DB.prepare(`
          INSERT INTO share_assets (share_id, asset_id, display_order)
          VALUES (?, ?, ?)
        `).bind(shareId, validAssets[i].id, i)
      );
    }
    await c.env.DB.batch(statements);
    
    // 4. 复制图片到公开目录（R2）
    for (const asset of validAssets) {
      try {
        // 复制原图
        const sourceKey = asset.r2_key;
        const destKey = `shared/${shareId}/${asset.content_hash}.${asset.file_name.split('.').pop()}`;
        
        const sourceObject = await c.env.R2.get(sourceKey);
        if (sourceObject) {
          await c.env.R2.put(destKey, sourceObject.body, {
            httpMetadata: {
              contentType: asset.mime_type,
            },
          });
          console.log(`[Share] 复制图片: ${sourceKey} -> ${destKey}`);
        }
        
        // 复制缩略图（如果存在）
        if (asset.thumb_r2_key) {
          const thumbSourceKey = asset.thumb_r2_key;
          const thumbDestKey = `shared/${shareId}/${asset.content_hash}_thumb.webp`;
          
          const thumbSourceObject = await c.env.R2.get(thumbSourceKey);
          if (thumbSourceObject) {
            await c.env.R2.put(thumbDestKey, thumbSourceObject.body, {
              httpMetadata: {
                contentType: 'image/webp',
              },
            });
          }
        }
      } catch (err) {
        console.error(`[Share] 复制图片失败: ${asset.id}`, err);
      }
    }
    
    const shareUrl = `${c.req.url.split('/share')[0]}/s/${shareId}`;
    
    console.log(`[Share] 创建成功: ${shareUrl}`);
    
    return success({
      share_id: shareId,
      share_url: shareUrl,
      expires_at: expiresAt,
    }, '分享创建成功');
    
  } catch (err) {
    console.error('[Share] 创建失败:', err);
    return error('创建分享失败', 500);
  }
});

/**
 * 获取分享详情
 * GET /s/:shareId
 */
share.get('/:shareId', async (c) => {
  const shareId = c.req.param('shareId');
  const ip = getClientIp(c.req.raw);
  const password = c.req.query('password');
  
  try {
    // 检查查看限制
    const viewCheck = await checkShareViewLimit(shareId, ip, c.env);
    if (!viewCheck.allowed) {
      return error(viewCheck.reason || '查看次数超限', 429);
    }
    
    // 1. 获取分享信息
    const shareInfo = await c.env.DB.prepare(
      'SELECT * FROM shares WHERE share_id = ?'
    ).bind(shareId).first<Share>();
    
    if (!shareInfo) {
      return notFound('分享不存在');
    }
    
    // 2. 检查是否过期
    if (shareInfo.expires_at && shareInfo.expires_at < now()) {
      return error('分享已过期', 410);
    }
    
    // 3. 检查下载次数限制
    if (shareInfo.max_downloads && shareInfo.download_count >= shareInfo.max_downloads) {
      return error('已达到最大下载次数', 403);
    }
    
    // 4. 检查密码
    if (shareInfo.password_hash) {
      if (!password) {
        return error('需要密码', 401);
      }
      
      const isValid = await verifyPassword(password, shareInfo.password_hash);
      if (!isValid) {
        return error('密码错误', 401);
      }
    }
    
    // 5. 获取资产列表
    const assets = await c.env.DB.prepare(`
      SELECT a.id, a.file_name, a.mime_type, a.width, a.height, a.content_hash, sa.display_order
      FROM share_assets sa
      JOIN assets a ON sa.asset_id = a.id
      WHERE sa.share_id = ?
      ORDER BY sa.display_order
    `).bind(shareId).all<Asset & { display_order: number }>();
    
    if (!assets.results || assets.results.length === 0) {
      return error('分享中没有资产', 404);
    }
    
    // 6. 生成公开访问 URL
    const baseUrl = c.req.url.split('/s/')[0];
    const assetsWithUrls = assets.results.map(asset => {
      const ext = asset.file_name.split('.').pop();
      return {
        id: asset.id,
        file_name: asset.file_name,
        mime_type: asset.mime_type,
        width: asset.width,
        height: asset.height,
        thumb_url: `${baseUrl}/r2/shared/${shareId}/${asset.content_hash}_thumb.webp`,
        download_url: `${baseUrl}/r2/shared/${shareId}/${asset.content_hash}.${ext}`,
      };
    });
    
    // 7. 更新查看次数
    await c.env.DB.prepare(
      'UPDATE shares SET view_count = view_count + 1 WHERE share_id = ?'
    ).bind(shareId).run();
    
    console.log(`[Share] 查看分享: ${shareId}, IP=${ip}`);
    
    return success({
      title: shareInfo.title,
      description: shareInfo.description,
      assets: assetsWithUrls,
      expires_at: shareInfo.expires_at,
      view_count: shareInfo.view_count + 1,
    });
    
  } catch (err) {
    console.error('[Share] 获取分享失败:', err);
    return error('获取分享失败', 500);
  }
});

/**
 * 获取我的分享列表
 * GET /share/list
 */
share.get('/list', async (c) => {
  const user = requireAuth(c);
  
  try {
    const shares = await c.env.DB.prepare(`
      SELECT 
        s.share_id, s.title, s.view_count, s.download_count, 
        s.created_at, s.expires_at,
        COUNT(sa.asset_id) as asset_count
      FROM shares s
      LEFT JOIN share_assets sa ON s.share_id = sa.share_id
      WHERE s.user_id = ?
      GROUP BY s.share_id
      ORDER BY s.created_at DESC
    `).bind(user.user_id).all();
    
    return success({
      shares: shares.results || [],
    });
    
  } catch (err) {
    console.error('[Share] 获取分享列表失败:', err);
    return error('获取分享列表失败', 500);
  }
});

/**
 * 删除分享
 * DELETE /share/:shareId
 */
share.delete('/:shareId', async (c) => {
  const user = requireAuth(c);
  const shareId = c.req.param('shareId');
  
  try {
    // 1. 验证分享属于当前用户
    const shareInfo = await c.env.DB.prepare(
      'SELECT user_id FROM shares WHERE share_id = ?'
    ).bind(shareId).first<{ user_id: string }>();
    
    if (!shareInfo) {
      return notFound('分享不存在');
    }
    
    if (shareInfo.user_id !== user.user_id) {
      return error('无权删除此分享', 403);
    }
    
    // 2. 删除分享记录（级联删除 share_assets）
    await c.env.DB.prepare(
      'DELETE FROM shares WHERE share_id = ?'
    ).bind(shareId).run();
    
    // 3. 删除 R2 中的共享文件
    try {
      const objects = await c.env.R2.list({ prefix: `shared/${shareId}/` });
      for (const obj of objects.objects) {
        await c.env.R2.delete(obj.key);
        console.log(`[Share] 删除文件: ${obj.key}`);
      }
    } catch (err) {
      console.error('[Share] 删除 R2 文件失败:', err);
    }
    
    console.log(`[Share] 删除分享: ${shareId}`);
    
    return success({ success: true }, '分享已删除');
    
  } catch (err) {
    console.error('[Share] 删除分享失败:', err);
    return error('删除分享失败', 500);
  }
});

/**
 * 导入分享(统计)
 * POST /share/:shareId/import
 */
share.post('/:shareId/import', async (c) => {
  const shareId = c.req.param('shareId');
  
  try {
    console.log(`[Share] 导入分享: ${shareId}`);
    
    // 1. 检查分享是否存在
    const shareInfo = await c.env.DB.prepare(
      'SELECT * FROM shares WHERE share_id = ?'
    ).bind(shareId).first<Share>();
    
    if (!shareInfo) {
      return notFound('分享不存在');
    }
    
    // 2. 检查是否过期
    if (shareInfo.expires_at && shareInfo.expires_at < Date.now()) {
      return error('分享已过期', 410);
    }
    
    // 3. 检查下载次数限制
    if (shareInfo.max_downloads && shareInfo.download_count >= shareInfo.max_downloads) {
      return error('已达到最大下载次数', 403);
    }
    
    // 4. 获取分享的资产列表
    const assets = await c.env.DB.prepare(`
      SELECT a.id, a.content_hash, a.file_name, a.mime_type
      FROM share_assets sa
      JOIN assets a ON sa.asset_id = a.id
      WHERE sa.share_id = ?
      ORDER BY sa.display_order
    `).bind(shareId).all<Asset>();
    
    // 5. 生成下载 URL
    const assetsWithUrls = (assets.results || []).map(asset => {
      const ext = asset.file_name.split('.').pop();
      return {
        id: asset.id,
        download_url: `/r2/shared/${shareId}/${asset.content_hash}.${ext}`,
      };
    });
    
    // 6. 更新下载次数
    await c.env.DB.prepare(`
      UPDATE shares 
      SET download_count = download_count + 1 
      WHERE share_id = ?
    `).bind(shareId).run();
    
    console.log(`[Share] 导入成功: ${shareId}, ${assetsWithUrls.length} 个资产`);
    
    return success({
      success: true,
      imported_count: assetsWithUrls.length,
      assets: assetsWithUrls,
    }, '导入成功');
    
  } catch (err) {
    console.error('[Share] 导入失败:', err);
    return error('导入失败', 500);
  }
});

export default share;
