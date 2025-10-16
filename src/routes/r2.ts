import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { success, error, notFound } from '../utils/response';
import { requireAuth } from '../middleware/auth';
import { generateUUID } from '../utils/helpers';

const r2 = new Hono<AppEnv>();

/**
 * 获取 R2 文件
 * GET /r2/*
 */
r2.get('/*', async (c) => {
  // 使用 path 而不是 param 来获取通配符路径
  const path = c.req.path;
  const key = path.replace('/r2/', '');
  
  if (!key) {
    return notFound('文件路径无效');
  }
  
  try {
    console.log(`[R2] 获取文件: ${key}`);
    
    const object = await c.env.R2.get(key);
    
    if (!object) {
      console.log(`[R2] 文件不存在: ${key}`);
      return notFound('文件不存在');
    }
    
    // 设置缓存头
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=31536000'); // 缓存 1 年
    headers.set('Access-Control-Allow-Origin', '*');
    
    if (object.httpEtag) {
      headers.set('ETag', object.httpEtag);
    }
    
    return new Response(object.body, {
      headers,
    });
    
  } catch (err) {
    console.error('[R2] 获取文件失败:', err);
    return notFound('获取文件失败');
  }
});

/**
 * 上传文件到 R2
 * POST /r2/upload
 * Headers: Content-Type: image/*
 * Body: Binary data
 */
r2.post('/upload', async (c) => {
  const user = requireAuth(c);
  
  try {
    console.log(`[R2] 上传文件: 用户=${user.user_id}`);
    
    // 1. 获取文件数据
    const contentType = c.req.header('Content-Type') || 'application/octet-stream';
    const contentHash = c.req.header('X-Content-Hash');
    const fileName = c.req.header('X-File-Name') || 'unknown';
    
    if (!contentHash) {
      return error('缺少 X-Content-Hash 头');
    }
    
    const fileData = await c.req.arrayBuffer();
    const fileSize = fileData.byteLength;
    
    console.log(`[R2] 文件信息: ${fileName}, ${fileSize} bytes, ${contentType}`);
    
    // 2. 生成 R2 key
    const ext = fileName.split('.').pop() || 'bin';
    const r2Key = `${user.user_id}/assets/${contentHash}.${ext}`;
    const thumbR2Key = `${user.user_id}/thumbs/${contentHash}_256.webp`;
    
    // 3. 上传原图到 R2
    await c.env.R2.put(r2Key, fileData, {
      httpMetadata: {
        contentType: contentType,
      },
    });
    
    console.log(`[R2] 上传成功: ${r2Key}`);
    
    // 4. 生成访问 URL (通过 /r2/* 路由访问)
    const r2Url = `/r2/${r2Key}`;
    
    return success({
      r2_key: r2Key,
      thumb_r2_key: thumbR2Key,
      r2_url: r2Url,
    }, '上传成功');
    
  } catch (err) {
    console.error('[R2] 上传失败:', err);
    return error('上传失败', 500);
  }
});

export default r2;
