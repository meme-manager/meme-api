/**
 * 管理员路由
 * 用于管理服务器配置、查看统计信息等
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { generateToken } from '../utils/jwt';

const app = new Hono<AppEnv>();

const LOG_PREFIX = '[Admin]';

/**
 * 验证管理员密码（SHA-256）
 */
async function verifyAdminPassword(password: string, hashFromDB: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  console.log(`${LOG_PREFIX} 验证管理员密码: ${hashHex === hashFromDB ? '✅ 成功' : '❌ 失败'}`);
  return hashHex === hashFromDB;
}

/**
 * 生成密码哈希（SHA-256）
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * 管理员认证中间件
 */
async function requireAdminAuth(c: any, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(`${LOG_PREFIX} ❌ 缺少 Authorization header`);
    return c.json({ success: false, error: '未授权：缺少认证令牌' }, 401);
  }
  
  const token = authHeader.substring(7);
  
  try {
    // 验证 token 是否为管理员 token
    // 这里简化处理，实际应该有专门的管理员 token 验证逻辑
    // 暂时检查 token 是否有效即可
    const payload = await c.env.JWT_SECRET ? 
      (await import('../utils/jwt')).verifyToken(token, c.env.JWT_SECRET) : 
      null;
    
    if (!payload) {
      return c.json({ success: false, error: '未授权：无效的令牌' }, 401);
    }
    
    await next();
  } catch (error) {
    console.error(`${LOG_PREFIX} Token 验证失败:`, error);
    return c.json({ success: false, error: '未授权：令牌验证失败' }, 401);
  }
}

/**
 * POST /admin/login
 * 管理员登录
 */
app.post('/login', async (c) => {
  try {
    const body = await c.req.json<{ password: string }>();
    
    console.log(`${LOG_PREFIX} 管理员登录请求`);
    
    if (!body.password) {
      return c.json({
        success: false,
        error: '缺少密码'
      }, 400);
    }
    
    // 查询数据库中的管理员密码哈希
    const result = await c.env.DB.prepare(
      'SELECT value FROM server_config WHERE key = ?'
    ).bind('admin_password_hash').first<{ value: string }>();
    
    if (!result) {
      console.error(`${LOG_PREFIX} ❌ 数据库中未找到管理员密码配置`);
      return c.json({
        success: false,
        error: '服务器配置错误'
      }, 500);
    }
    
    // 验证密码
    const isValid = await verifyAdminPassword(body.password, result.value);
    
    if (!isValid) {
      console.log(`${LOG_PREFIX} ❌ 管理员密码错误`);
      return c.json({
        success: false,
        error: '密码错误'
      }, 401);
    }
    
    // 生成管理员 token（有效期 24 小时）
    if (!c.env.JWT_SECRET) {
      return c.json({
        success: false,
        error: '服务器配置错误：JWT_SECRET 未设置'
      }, 500);
    }
    
    const token = await generateToken(
      { device_id: 'admin' },
      c.env.JWT_SECRET
    );
    
    console.log(`${LOG_PREFIX} ✅ 管理员登录成功`);
    
    return c.json({
      success: true,
      data: {
        token,
        expires_at: Date.now() + 24 * 60 * 60 * 1000
      }
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} 登录失败:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '登录失败'
    }, 500);
  }
});

/**
 * GET /admin/config
 * 获取服务器配置
 */
app.get('/config', requireAdminAuth, async (c) => {
  try {
    console.log(`${LOG_PREFIX} 获取服务器配置`);
    
    const configs = await c.env.DB.prepare(
      'SELECT key, value, updated_at, description FROM server_config'
    ).all<{ key: string; value: string; updated_at: number; description: string }>();
    
    // 不返回密码哈希，只返回配置状态
    const safeConfigs = configs.results.map((config: any) => {
      if (config.key.includes('password_hash')) {
        return {
          ...config,
          value: '***已设置***',
          has_value: config.value.length > 0
        };
      }
      return config;
    });
    
    console.log(`${LOG_PREFIX} ✅ 返回 ${safeConfigs.length} 项配置`);
    
    return c.json({
      success: true,
      data: safeConfigs
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} 获取配置失败:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '获取配置失败'
    }, 500);
  }
});

/**
 * POST /admin/config
 * 更新服务器配置
 */
app.post('/config', requireAdminAuth, async (c) => {
  try {
    const body = await c.req.json<{
      server_name?: string;
      require_sync_password?: boolean;
    }>();
    
    console.log(`${LOG_PREFIX} 更新服务器配置:`, body);
    
    const updates: Array<{ key: string; value: string }> = [];
    
    if (body.server_name !== undefined) {
      updates.push({ key: 'server_name', value: body.server_name });
    }
    
    if (body.require_sync_password !== undefined) {
      updates.push({ 
        key: 'require_sync_password', 
        value: body.require_sync_password ? 'true' : 'false' 
      });
    }
    
    if (updates.length === 0) {
      return c.json({
        success: false,
        error: '没有需要更新的配置'
      }, 400);
    }
    
    // 批量更新
    for (const update of updates) {
      await c.env.DB.prepare(
        'UPDATE server_config SET value = ?, updated_at = ? WHERE key = ?'
      ).bind(update.value, Date.now(), update.key).run();
    }
    
    console.log(`${LOG_PREFIX} ✅ 成功更新 ${updates.length} 项配置`);
    
    return c.json({
      success: true,
      message: `成功更新 ${updates.length} 项配置`
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} 更新配置失败:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '更新配置失败'
    }, 500);
  }
});

/**
 * POST /admin/set-sync-password
 * 设置同步密码
 */
app.post('/set-sync-password', requireAdminAuth, async (c) => {
  try {
    const body = await c.req.json<{ password: string }>();
    
    console.log(`${LOG_PREFIX} 设置同步密码`);
    
    if (!body.password) {
      return c.json({
        success: false,
        error: '缺少密码'
      }, 400);
    }
    
    // 生成密码哈希
    const hash = await hashPassword(body.password);
    
    // 更新数据库
    await c.env.DB.prepare(
      'UPDATE server_config SET value = ?, updated_at = ? WHERE key = ?'
    ).bind(hash, Date.now(), 'sync_password_hash').run();
    
    // 启用同步密码要求
    await c.env.DB.prepare(
      'UPDATE server_config SET value = ?, updated_at = ? WHERE key = ?'
    ).bind('true', Date.now(), 'require_sync_password').run();
    
    console.log(`${LOG_PREFIX} ✅ 同步密码设置成功`);
    
    return c.json({
      success: true,
      message: '同步密码设置成功'
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} 设置同步密码失败:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '设置同步密码失败'
    }, 500);
  }
});

/**
 * POST /admin/set-admin-password
 * 修改管理员密码
 */
app.post('/set-admin-password', requireAdminAuth, async (c) => {
  try {
    const body = await c.req.json<{ 
      old_password: string;
      new_password: string;
    }>();
    
    console.log(`${LOG_PREFIX} 修改管理员密码`);
    
    if (!body.old_password || !body.new_password) {
      return c.json({
        success: false,
        error: '缺少旧密码或新密码'
      }, 400);
    }
    
    // 验证旧密码
    const result = await c.env.DB.prepare(
      'SELECT value FROM server_config WHERE key = ?'
    ).bind('admin_password_hash').first<{ value: string }>();
    
    if (!result) {
      return c.json({
        success: false,
        error: '服务器配置错误'
      }, 500);
    }
    
    const isValid = await verifyAdminPassword(body.old_password, result.value);
    
    if (!isValid) {
      console.log(`${LOG_PREFIX} ❌ 旧密码错误`);
      return c.json({
        success: false,
        error: '旧密码错误'
      }, 401);
    }
    
    // 生成新密码哈希
    const newHash = await hashPassword(body.new_password);
    
    // 更新数据库
    await c.env.DB.prepare(
      'UPDATE server_config SET value = ?, updated_at = ? WHERE key = ?'
    ).bind(newHash, Date.now(), 'admin_password_hash').run();
    
    console.log(`${LOG_PREFIX} ✅ 管理员密码修改成功`);
    
    return c.json({
      success: true,
      message: '管理员密码修改成功'
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} 修改管理员密码失败:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '修改管理员密码失败'
    }, 500);
  }
});

/**
 * GET /admin/stats
 * 获取服务器统计信息
 */
app.get('/stats', requireAdminAuth, async (c) => {
  try {
    console.log(`${LOG_PREFIX} 获取服务器统计信息`);
    
    // 统计设备数量
    const deviceCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM devices'
    ).first<{ count: number }>();
    
    // 统计资产数量
    const assetCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM assets WHERE deleted = 0'
    ).first<{ count: number }>();
    
    // 统计删除的资产数量
    const deletedAssetCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM assets WHERE deleted = 1'
    ).first<{ count: number }>();
    
    // 统计标签数量
    const tagCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM tags'
    ).first<{ count: number }>();
    
    // 统计分享数量
    const shareCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM shares WHERE expires_at > ? OR expires_at IS NULL'
    ).bind(Date.now()).first<{ count: number }>();
    
    // 统计存储使用量（近似值）
    const storageUsed = await c.env.DB.prepare(
      'SELECT SUM(file_size) as total FROM assets WHERE deleted = 0'
    ).first<{ total: number }>();
    
    // 按设备统计资产数量
    const assetsByDevice = await c.env.DB.prepare(
      `SELECT 
        created_by_device, 
        COUNT(*) as count 
      FROM assets 
      WHERE deleted = 0 AND created_by_device IS NOT NULL
      GROUP BY created_by_device`
    ).all<{ created_by_device: string; count: number }>();
    
    console.log(`${LOG_PREFIX} ✅ 统计完成`);
    
    return c.json({
      success: true,
      data: {
        devices: deviceCount?.count || 0,
        assets: assetCount?.count || 0,
        deleted_assets: deletedAssetCount?.count || 0,
        tags: tagCount?.count || 0,
        shares: shareCount?.count || 0,
        storage_used: storageUsed?.total || 0,
        assets_by_device: assetsByDevice.results || []
      }
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} 获取统计信息失败:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '获取统计信息失败'
    }, 500);
  }
});

/**
 * GET /admin/devices
 * 获取所有设备列表
 */
app.get('/devices', requireAdminAuth, async (c) => {
  try {
    console.log(`${LOG_PREFIX} 获取设备列表`);
    
    const devices = await c.env.DB.prepare(
      `SELECT 
        device_id,
        device_name,
        device_type,
        platform,
        last_active_at,
        created_at
      FROM devices
      ORDER BY last_active_at DESC`
    ).all();
    
    console.log(`${LOG_PREFIX} ✅ 返回 ${devices.results.length} 个设备`);
    
    return c.json({
      success: true,
      data: devices.results
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} 获取设备列表失败:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '获取设备列表失败'
    }, 500);
  }
});

/**
 * POST /admin/clear-sync-password
 * 清除同步密码（禁用同步密码要求）
 */
app.post('/clear-sync-password', requireAdminAuth, async (c) => {
  try {
    console.log(`${LOG_PREFIX} 清除同步密码`);
    
    // 清空同步密码哈希
    await c.env.DB.prepare(
      'UPDATE server_config SET value = ?, updated_at = ? WHERE key = ?'
    ).bind('', Date.now(), 'sync_password_hash').run();
    
    // 禁用同步密码要求
    await c.env.DB.prepare(
      'UPDATE server_config SET value = ?, updated_at = ? WHERE key = ?'
    ).bind('false', Date.now(), 'require_sync_password').run();
    
    console.log(`${LOG_PREFIX} ✅ 同步密码已清除`);
    
    return c.json({
      success: true,
      message: '同步密码已清除'
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} 清除同步密码失败:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '清除同步密码失败'
    }, 500);
  }
});

export default app;
