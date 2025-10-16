import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types';
import { corsPreflightResponse } from './utils/response';
import { authMiddleware, optionalAuthMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';

// 导入路由
import auth from './routes/auth';
import sync from './routes/sync';
import share from './routes/share';
import quota from './routes/quota';
import r2 from './routes/r2';

const app = new Hono<AppEnv>();

// CORS 中间件
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// 处理 OPTIONS 请求
app.options('/*', (c) => corsPreflightResponse());

// 健康检查
app.get('/', (c) => {
  return c.json({
    name: 'Meme Manager API',
    version: '1.0.0',
    status: 'ok',
    timestamp: Date.now(),
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// 公开路由（不需要认证）
app.route('/auth', auth);
app.route('/s', share); // 分享查看（部分需要认证）
app.route('/r2', r2); // R2 文件访问

// 需要认证的路由
app.use('/sync/*', authMiddleware);
app.use('/share/create', authMiddleware);
app.use('/share/list', authMiddleware);
app.use('/share/:shareId', authMiddleware); // DELETE 需要认证
app.use('/quota/*', authMiddleware);

// 限流中间件（应用到所有路由）
app.use('/*', rateLimitMiddleware);

// 注册路由
app.route('/auth', auth);
app.route('/sync', sync);
app.route('/share', share);
app.route('/quota', quota);
app.route('/r2', r2);

// 分享预览页面 (GET /s/:shareId)
app.get('/s/:shareId', async (c) => {
  const shareId = c.req.param('shareId');
  
  try {
    // 1. 获取分享信息
    const shareInfo = await c.env.DB.prepare(
      'SELECT * FROM shares WHERE share_id = ?'
    ).bind(shareId).first() as any;
    
    if (!shareInfo) {
      return c.html('<h1>分享不存在或已过期</h1>', 404);
    }
    
    // 2. 检查是否过期
    if (shareInfo.expires_at && shareInfo.expires_at < Date.now()) {
      return c.html('<h1>分享已过期</h1>', 410);
    }
    
    // 3. 获取资产列表
    const assets = await c.env.DB.prepare(`
      SELECT a.*, sa.display_order
      FROM share_assets sa
      JOIN assets a ON sa.asset_id = a.id
      WHERE sa.share_id = ?
      ORDER BY sa.display_order
    `).bind(shareId).all() as any;
    
    // 4. 更新查看次数
    await c.env.DB.prepare(
      'UPDATE shares SET view_count = view_count + 1 WHERE share_id = ?'
    ).bind(shareId).run();
    
    // 5. 生成 HTML
    const assetsHtml = (assets.results || []).map((asset: any) => {
      const ext = asset.file_name.split('.').pop();
      const thumbUrl = `/r2/shared/${shareId}/${asset.content_hash}_thumb.webp`;
      const downloadUrl = `/r2/shared/${shareId}/${asset.content_hash}.${ext}`;
      
      return `
        <div class="image-card">
          <img src="${thumbUrl}" alt="${asset.file_name}" loading="lazy">
          <div class="image-overlay">
            <button onclick="downloadImage('${downloadUrl}', '${asset.file_name}')">下载</button>
          </div>
        </div>
      `;
    }).join('');
    
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${shareInfo.title || '表情包分享'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { text-align: center; margin-bottom: 30px; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { font-size: 28px; margin-bottom: 10px; color: #333; }
    .description { color: #666; margin-bottom: 15px; }
    .stats { display: flex; gap: 20px; justify-content: center; color: #999; font-size: 14px; }
    .image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
    .image-card { position: relative; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: transform 0.2s; }
    .image-card:hover { transform: translateY(-4px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .image-card img { width: 100%; height: 200px; object-fit: cover; }
    .image-overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.7)); padding: 15px; opacity: 0; transition: opacity 0.2s; }
    .image-card:hover .image-overlay { opacity: 1; }
    .image-overlay button { width: 100%; padding: 8px; background: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; }
    .actions { display: flex; gap: 15px; justify-content: center; margin-bottom: 30px; }
    .btn { padding: 12px 30px; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; transition: all 0.2s; }
    .btn-primary { background: #007AFF; color: white; }
    .btn-primary:hover { background: #0051D5; }
    .btn-secondary { background: white; color: #333; border: 1px solid #ddd; }
    .btn-secondary:hover { background: #f5f5f5; }
    footer { text-align: center; color: #999; font-size: 14px; padding: 20px; }
    footer a { color: #007AFF; text-decoration: none; }
    @media (max-width: 768px) {
      .image-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
      .actions { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${shareInfo.title || '表情包分享'}</h1>
      ${shareInfo.description ? `<p class="description">${shareInfo.description}</p>` : ''}
      <div class="stats">
        <span>👁️ ${shareInfo.view_count + 1} 次查看</span>
        <span>📥 ${shareInfo.download_count} 次下载</span>
      </div>
    </header>
    
    <div class="image-grid">
      ${assetsHtml}
    </div>
    
    <div class="actions">
      <button class="btn btn-primary" onclick="importToApp()">📱 导入到应用</button>
      <button class="btn btn-secondary" onclick="downloadAll()">📦 下载全部</button>
    </div>
    
    <footer>
      <p>使用 <a href="https://github.com/your-repo">表情包管理工具</a> 创建</p>
    </footer>
  </div>
  
  <script>
    const shareId = '${shareId}';
    const assets = ${JSON.stringify((assets.results || []).map((a: any) => {
      const ext = a.file_name.split('.').pop();
      return {
        id: a.id,
        file_name: a.file_name,
        download_url: `/r2/shared/${shareId}/${a.content_hash}.${ext}`
      };
    }))};
    
    function importToApp() {
      // 尝试唤起应用
      window.location.href = 'meme://import?share_id=' + shareId;
      
      // 2秒后如果还在页面,显示提示
      setTimeout(() => {
        if (!document.hidden) {
          alert('请先安装表情包管理工具\\n或手动下载图片');
        }
      }, 2000);
    }
    
    function downloadAll() {
      assets.forEach((asset, index) => {
        setTimeout(() => {
          downloadImage(asset.download_url, asset.file_name);
        }, index * 200);
      });
    }
    
    function downloadImage(url, filename) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || '';
      a.click();
    }
  </script>
</body>
</html>
    `;
    
    return c.html(html);
    
  } catch (err) {
    console.error('[Share] 获取分享页面失败:', err);
    return c.html('<h1>加载失败</h1>', 500);
  }
});

// 404 处理
app.notFound((c) => {
  return c.json({
    success: false,
    error: '接口不存在',
    path: c.req.path,
  }, 404);
});

// 错误处理
app.onError((err, c) => {
  console.error('[Error]', err);
  
  return c.json({
    success: false,
    error: err.message || '服务器错误',
  }, 500);
});

export default app;
