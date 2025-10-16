import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { success, error } from '../utils/response';
import { generateToken } from '../utils/jwt';
import { generateUUID, now, safeJsonParse, validateRequired } from '../utils/helpers';

const auth = new Hono<AppEnv>();

/**
 * 设备注册/登录
 * POST /auth/device-register
 */
auth.post('/device-register', async (c) => {
  const body = await safeJsonParse<{
    device_id?: string;
    device_name: string;
    device_type: string;
    platform: string;
  }>(c.req.raw);
  
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
    
    // 1. 检查设备是否已存在
    const existingDevice = await c.env.DB.prepare(
      'SELECT user_id FROM devices WHERE device_id = ?'
    ).bind(deviceId).first<{ user_id: string }>();
    
    let userId: string;
    
    if (existingDevice) {
      // 设备已存在，更新最后访问时间
      userId = existingDevice.user_id;
      
      await c.env.DB.prepare(`
        UPDATE devices 
        SET device_name = ?, device_type = ?, platform = ?, last_seen_at = ?
        WHERE device_id = ?
      `).bind(body.device_name, body.device_type, body.platform, timestamp, deviceId).run();
      
      // 更新用户最后登录时间
      await c.env.DB.prepare(
        'UPDATE users SET last_login_at = ? WHERE user_id = ?'
      ).bind(timestamp, userId).run();
      
      console.log(`[Auth] 设备登录: ${deviceId}, 用户: ${userId}`);
    } else {
      // 新设备，创建新用户
      userId = generateUUID();
      
      // 创建用户
      await c.env.DB.prepare(`
        INSERT INTO users (user_id, created_at, last_login_at, storage_used)
        VALUES (?, ?, ?, 0)
      `).bind(userId, timestamp, timestamp).run();
      
      // 创建设备
      await c.env.DB.prepare(`
        INSERT INTO devices (device_id, user_id, device_name, device_type, platform, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(deviceId, userId, body.device_name, body.device_type, body.platform, timestamp).run();
      
      // 创建默认设置
      const defaultSettings = [
        { key: 'auto_play_gif', value: 'true' },
        { key: 'theme', value: 'light' },
        { key: 'grid_size', value: 'medium' },
      ];
      
      for (const setting of defaultSettings) {
        await c.env.DB.prepare(`
          INSERT INTO user_settings (user_id, key, value, updated_at)
          VALUES (?, ?, ?, ?)
        `).bind(userId, setting.key, setting.value, timestamp).run();
      }
      
      console.log(`[Auth] 新用户注册: ${userId}, 设备: ${deviceId}`);
    }
    
    // 2. 生成 JWT Token
    const secret = c.env.JWT_SECRET || 'default-secret-change-in-production';
    const token = await generateToken(
      { user_id: userId, device_id: deviceId },
      secret,
      30 * 24 * 60 * 60 // 30天
    );
    
    const expiresAt = timestamp + 30 * 24 * 60 * 60 * 1000;
    
    return success({
      token,
      user_id: userId,
      device_id: deviceId,
      expires_at: expiresAt,
    }, existingDevice ? '登录成功' : '注册成功');
    
  } catch (err) {
    console.error('[Auth] 设备注册失败:', err);
    return error('设备注册失败', 500);
  }
});

/**
 * 获取用户信息
 * GET /auth/me
 */
auth.get('/me', async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return error('未认证', 401);
  }
  
  try {
    const userInfo = await c.env.DB.prepare(
      'SELECT user_id, created_at, last_login_at, storage_used FROM users WHERE user_id = ?'
    ).bind(user.user_id).first();
    
    if (!userInfo) {
      return error('用户不存在', 404);
    }
    
    return success(userInfo);
  } catch (err) {
    console.error('[Auth] 获取用户信息失败:', err);
    return error('获取用户信息失败', 500);
  }
});

export default auth;
