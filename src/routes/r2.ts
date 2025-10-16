import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { success, error, notFound } from '../utils/response';
import { authMiddleware, requireAuth } from '../middleware/auth';
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
r2.post('/upload', authMiddleware, async (c) => {
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

/**
 * 批量检查 R2 文件是否存在
 * POST /r2/batch-check
 */
r2.post('/batch-check', authMiddleware, async (c) => {
  const user = requireAuth(c);
  
  try {
    const body = await c.req.json<{ r2_keys: string[] }>();
    const r2Keys = body.r2_keys;
    
    if (!r2Keys || !Array.isArray(r2Keys)) {
      return error('缺少 r2_keys 参数或格式错误');
    }
    
    if (r2Keys.length === 0) {
      return success({ results: [] });
    }
    
    if (r2Keys.length > 100) {
      return error('单次最多检查 100 个文件');
    }
    
    console.log(`[R2] 批量检查文件: ${r2Keys.length} 个`);
    
    // 并发检查所有文件
    const results = await Promise.all(
      r2Keys.map(async (r2Key) => {
        try {
          const object = await c.env.R2.head(r2Key);
          return {
            r2_key: r2Key,
            exists: object !== null,
            size: object?.size,
            uploaded: object?.uploaded
          };
        } catch (err) {
          console.error(`[R2] 检查文件失败: ${r2Key}`, err);
          return {
            r2_key: r2Key,
            exists: false,
            error: err instanceof Error ? err.message : '未知错误'
          };
        }
      })
    );
    
    const existsCount = results.filter(r => r.exists).length;
    console.log(`[R2] 批量检查完成: ${existsCount}/${r2Keys.length} 存在`);
    
    return success({ 
      results,
      summary: {
        total: r2Keys.length,
        exists: existsCount,
        missing: r2Keys.length - existsCount
      }
    });
  } catch (err) {
    console.error('[R2] 批量检查失败:', err);
    return error('批量检查失败', 500);
  }
});

/**
 * 下载 R2 文件
 * GET /r2/download/:key
 */
r2.get('/download/:key', authMiddleware, async (c) => {
  const user = requireAuth(c);
  const key = decodeURIComponent(c.req.param('key'));
  
  try {
    console.log(`[R2] 下载文件: ${key}`);
    
    const object = await c.env.R2.get(key);
    
    if (!object) {
      console.log(`[R2] 文件不存在: ${key}`);
      return notFound('文件不存在');
    }
    
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Disposition', `attachment; filename="${key.split('/').pop()}"`);
    headers.set('Access-Control-Allow-Origin', '*');
    
    return new Response(object.body, {
      headers,
    });
  } catch (err) {
    console.error('[R2] 下载文件失败:', err);
    return error('下载失败', 500);
  }
});

/**
 * 删除 R2 文件
 * DELETE /r2/delete/:key
 */
r2.delete('/delete/:key', authMiddleware, async (c) => {
  const user = requireAuth(c);
  const key = decodeURIComponent(c.req.param('key'));
  
  try {
    console.log(`[R2] 删除文件: ${key}`);
    
    await c.env.R2.delete(key);
    
    console.log(`[R2] 删除成功: ${key}`);
    
    return success({
      deleted: true
    }, '删除成功');
  } catch (err) {
    console.error('[R2] 删除文件失败:', err);
    return error('删除失败', 500);
  }
});

export default r2;
