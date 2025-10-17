import { Hono } from 'hono';
import type { AppEnv, AuthRequest, AuthResponse } from '../types';
import { success, error } from '../utils/response';
import { generateToken } from '../utils/jwt';
import { generateUUID, now, safeJsonParse, validateRequired, hashPassword } from '../utils/helpers';

const auth = new Hono<AppEnv>();

/**
 * 设备注册/登录（无用户概念）
 * POST /auth/device-register
 */
auth.post('/device-register', async (c) => {
  const body = await safeJsonParse<AuthRequest>(c.req.raw);
  
  if (!body) {
    return error('无效的请求数据');
  }
  
  // 验证必填字段
  const validation = validateRequired(body, ['device_name', 'device_type', 'platform']);
  if (!validation.valid) {
    return error(`缺少必填字段: ${validation.missing?.join(', ')}`);
  }
  
  try {
    const deviceId = body.device_id || generateUUID();
    const timestamp = now();
    
    console.log(`[Auth] 设备注册/登录: ${deviceId} (${body.device_name})`);
    
    // 1. 强制验证同步密码（防止未授权设备连接）
    if (!body.sync_password) {
      return error('必须提供同步密码。请联系管理员获取密码。', 401);
    }
    
    const storedHash = await c.env.DB.prepare(
      "SELECT value FROM server_config WHERE key = 'sync_password_hash'"
    ).first<{ value: string }>();
    
    // 检查是否已设置同步密码
    if (!storedHash || !storedHash.value) {
      console.log(`[Auth] ❌ 服务器未设置同步密码`);
      return error('服务器未设置同步密码。请管理员先在管理面板中设置同步密码。', 500);
    }
    
    const inputHash = await hashPassword(body.sync_password);
    
    if (storedHash.value !== inputHash) {
      console.log(`[Auth] ❌ 同步密码错误`);
      return error('同步密码错误', 401);
    }
    
    console.log(`[Auth] ✅ 同步密码验证通过`);
    
    // 2. 检查设备是否已存在
    const existingDevice = await c.env.DB.prepare(
      'SELECT device_id FROM devices WHERE device_id = ?'
    ).bind(deviceId).first();
    
    if (existingDevice) {
      // 设备已存在，更新信息
      await c.env.DB.prepare(`
        UPDATE devices 
        SET device_name = ?, device_type = ?, platform = ?, last_seen_at = ?
        WHERE device_id = ?
      `).bind(body.device_name, body.device_type, body.platform, timestamp, deviceId).run();
      
      console.log(`[Auth] 设备更新: ${deviceId}`);
    } else {
      // 新设备，创建记录
      await c.env.DB.prepare(`
        INSERT INTO devices (device_id, device_name, device_type, platform, last_seen_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(deviceId, body.device_name, body.device_type, body.platform, timestamp, timestamp).run();
      
      console.log(`[Auth] 新设备注册: ${deviceId}`);
    }
    
    // 3. 生成 JWT Token
    const secret = c.env.JWT_SECRET || 'default-secret-change-in-production';
    const token = await generateToken(
      { device_id: deviceId },
      secret,
      30 * 24 * 60 * 60 // 30天
    );
    
    const expiresAt = timestamp + 30 * 24 * 60 * 60 * 1000;
    
    // 4. 获取服务器名称
    const serverName = await c.env.DB.prepare(
      "SELECT value FROM server_config WHERE key = 'server_name'"
    ).first<{ value: string }>();
    
    const response: AuthResponse = {
      device_id: deviceId,
      token,
      expires_at: expiresAt,
      server_name: serverName?.value || 'Meme Manager',
      require_sync_password: true, // 始终要求同步密码
    };
    
    return success(response, existingDevice ? '登录成功' : '注册成功');
    
  } catch (err) {
    console.error('[Auth] 设备注册失败:', err);
    return error('设备注册失败', 500);
  }
});

/**
 * 获取设备信息
 * GET /auth/me
 */
auth.get('/me', async (c) => {
  const device = c.get('device');
  
  if (!device) {
    return error('未认证', 401);
  }
  
  try {
    const deviceInfo = await c.env.DB.prepare(
      'SELECT device_id, device_name, device_type, platform, created_at, last_seen_at FROM devices WHERE device_id = ?'
    ).bind(device.device_id).first();
    
    if (!deviceInfo) {
      return error('设备不存在', 404);
    }
    
    // 获取服务器配置
    const serverName = await c.env.DB.prepare(
      "SELECT value FROM server_config WHERE key = 'server_name'"
    ).first<{ value: string }>();
    
    const requirePassword = await c.env.DB.prepare(
      "SELECT value FROM server_config WHERE key = 'require_sync_password'"
    ).first<{ value: string }>();
    
    return success({
      device: deviceInfo,
      server_name: serverName?.value || 'Meme Manager',
      require_sync_password: requirePassword?.value === 'true',
    });
  } catch (err) {
    console.error('[Auth] 获取设备信息失败:', err);
    return error('获取设备信息失败', 500);
  }
});

export default auth;
