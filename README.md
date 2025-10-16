# Meme Manager - Workers API

Cloudflare Workers API for Meme Manager

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/meme-manager/meme-api)

## 🚀 快速部署

### 一键部署

点击上面的按钮一键部署到 Cloudflare!

### 命令行部署

```bash
./deploy.sh
```

## 📖 功能特性

- ✅ 设备注册和 JWT 认证
- ✅ 云同步 (Pull/Push)
- ✅ 分享功能
- ✅ 配额管理
- ✅ R2 文件访问

## 🛠️ 本地开发

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:8787

### 数据库迁移

```bash
# 本地
npm run db:migrate:local

# 远程
npm run db:migrate
```

## 📚 API 文档

详细的 API 文档请查看 [API.md](./API.md)

## 🔧 配置

### 环境变量

创建 `.dev.vars` 文件:

```
JWT_SECRET=your-secret-key
```

### Cloudflare 资源

- D1 数据库: `meme-db`
- R2 存储桶: `meme-storage`

## 📝 License

MIT
