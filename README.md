# Meme Manager - Workers API

Cloudflare Workers API for Meme Manager - 一个轻量级、高性能的表情包管理云端 API

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/meme-manager/meme-api)

## 🌐 网页版一键部署

**简单 3 步:**

1. **点击部署按钮**
   - 点击上面的 [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/meme-manager/meme-api) 按钮

2. **设置密钥**
   - 生成 `JWT_SECRET`:
     ```javascript
     // 在浏览器控制台 (F12) 运行
     Array.from(crypto.getRandomValues(new Uint8Array(32)))
       .map(b => b.toString(16).padStart(2, '0'))
       .join('')
     ```
   - 粘贴到 `JWT_SECRET` 输入框

3. **点击 Deploy**
   - Cloudflare 会自动执行 `npm run deploy`
   - 自动部署脚本会按顺序:
     1. ✅ 检查并创建 D1 数据库
     2. ✅ 获取数据库 ID
     3. ✅ 自动更新 `wrangler.toml` 配置
     4. ✅ 创建 R2 存储桶
     5. ✅ 部署 Worker
     6. ✅ 运行数据库迁移
   - 预计时间: 2-3 分钟

**完成!** 访问 Cloudflare Dashboard 查看 Worker URL,在桌面应用中配置服务器地址即可使用。

**部署日志示例**:
```
🚀 开始自动部署 Meme API...
[✓] wrangler 检查通过
[INFO] 检查 D1 数据库状态...
[!] 数据库 meme-db 不存在,开始创建...
[✓] 数据库创建成功!
[INFO] 数据库 ID: abc123...
[INFO] 更新 wrangler.toml 配置...
[✓] 已更新 database_id
[INFO] 检查 R2 存储桶...
[✓] R2 存储桶 meme-storage 已存在
[INFO] 开始部署 Worker...
[✓] Worker 部署成功!
[INFO] 运行数据库迁移...
[✓] 数据库迁移完成!
✅ 部署流程完成!
```

---

## 💻 命令行部署

如果你想手动部署:

```bash
./deploy.sh
```

脚本会自动:
- 创建 D1 数据库和 R2 存储桶
- 从 `wrangler.toml.example` 生成 `wrangler.local.toml` 配置文件
- 自动填入资源 ID
- 运行数据库迁移
- 部署到 Cloudflare Workers

**注意**: `wrangler.local.toml` 包含你的资源 ID,已加入 `.gitignore`,不会被提交到 Git

## 📖 功能特性

- ✅ 设备注册和 JWT 认证
- ✅ 云同步 (Pull/Push)
- ✅ 分享功能
- ✅ 配额管理
- ✅ R2 文件访问

## 🔄 自动部署

### Cloudflare 一键部署用户 (推荐)

使用一键部署后,Cloudflare 会自动配置 **Workers Builds** (CI/CD):

```
你的代码更新
    ↓
git push origin main
    ↓
Cloudflare 自动检测到更新
    ↓
自动运行 npm run deploy
    ↓
执行数据库迁移 + 部署 Worker
    ↓
部署完成 ✅
```

**特点**:
- ✅ 每次 push 到 main 分支自动触发部署
- ✅ 在 Cloudflare Dashboard → Workers & Pages → 你的项目 → Settings → Builds 查看配置
- ✅ 无需手动配置 GitHub Actions
- ✅ 部署日志直接在 Cloudflare Dashboard 查看

### 手动部署用户 (使用 GitHub Actions)

如果使用 `./deploy.sh` 手动部署,可以配置 GitHub Actions 实现自动部署:

**步骤 1: 获取 Cloudflare API Token**
- 访问 https://dash.cloudflare.com/profile/api-tokens
- 点击 "Create Token"
- 使用 "Edit Cloudflare Workers" 模板
- 复制生成的 Token

**步骤 2: 获取 Account ID**
- 访问 Cloudflare Dashboard
- 在右侧边栏找到 "Account ID"
- 复制 Account ID

**步骤 3: 配置 GitHub Secrets**
- 进入你的 GitHub 仓库
- Settings → Secrets and variables → Actions → New repository secret
- 添加两个 secrets:
  - `CLOUDFLARE_API_TOKEN`: 粘贴你的 API Token
  - `CLOUDFLARE_ACCOUNT_ID`: 粘贴你的 Account ID

**完成!** 现在每次 push 到 main 分支会自动部署:
- 已包含 `.github/workflows/deploy.yml` 配置文件
- 自动运行数据库迁移
- 自动部署 Worker
- 在 GitHub Actions 标签页查看部署日志

## 🛠️ 本地开发

### 安装依赖

```bash
npm install
```

### 初始化本地数据库

首次运行需要先初始化本地数据库：

```bash
npm run db:migrate:local
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:8787

本地开发环境特点：
- 使用本地 SQLite 数据库（不需要连接 Cloudflare）
- 使用 R2 模拟器
- 数据持久化在 `.wrangler/state/` 目录

### 数据库迁移

```bash
# 本地
npm run db:migrate:local

# 远程
npm run db:migrate
```

## 📚 API 端点

### 健康检查

```bash
GET /health
```

返回：
```json
{"status":"ok","timestamp":1234567890}
```

### 设备注册/登录

```bash
POST /auth/device-register
Content-Type: application/json

{
  "device_name": "我的设备",
  "device_type": "desktop",
  "platform": "macos"
}
```

返回：
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "user_id": "uuid",
    "device_id": "uuid",
    "expires_at": 1234567890
  },
  "message": "注册成功"
}
```

### 其他 API

- `POST /sync/pull` - 拉取云端数据
- `POST /sync/push` - 推送本地数据
- `POST /share/create` - 创建分享
- `GET /s/:shareId` - 查看分享页面
- `GET /quota/info` - 查看配额信息

完整的 API 文档请查看源代码 `src/routes/` 目录

## 🔧 配置

### 配置文件

项目包含以下配置文件:
- **`wrangler.jsonc`**: 通用配置文件（JSON 格式），用于一键部署，已提交到 Git
- **`wrangler.toml.example`**: 配置模板（TOML 格式），用于手动部署参考
- **`wrangler.local.toml`**: 本地配置文件，包含你的资源 ID，已加入 `.gitignore`

**配置格式说明**:
- `wrangler.jsonc` 不包含 `database_id`，Cloudflare 会在部署时自动创建 D1 数据库并填入真实 ID
- 手动部署时，`./deploy.sh` 会从模板生成 `wrangler.local.toml` 并填入资源 ID

### 环境变量

部署脚本会自动生成 JWT 密钥并创建 `.dev.vars` 文件

手动创建 `.dev.vars`:
```
JWT_SECRET=your-secret-key
```

### Cloudflare 资源

部署脚本会自动创建:
- D1 数据库: `meme-db`
- R2 存储桶: `meme-storage`

### 生成 JWT 密钥

```bash
# 方法 1: 使用 OpenSSL
openssl rand -hex 32

# 方法 2: 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## ✅ 部署验证

部署成功后，可以通过以下方式验证：

```bash
# 1. 健康检查
curl https://your-worker.workers.dev/health

# 2. 测试设备注册
curl -X POST https://your-worker.workers.dev/auth/device-register \
  -H "Content-Type: application/json" \
  -d '{
    "device_name": "Test Device",
    "device_type": "desktop",
    "platform": "macos"
  }'
```

## 🔍 故障排除

### 常见问题

**1. 一键部署失败**
- 检查 Cloudflare 账户是否有 D1 和 R2 权限
- 查看 Cloudflare Dashboard 的部署日志
- 确认 `wrangler.toml` 配置正确

**2. 数据库迁移失败**
```bash
# 手动运行迁移
npx wrangler d1 execute meme-db --file=./migrations/0001_initial.sql --remote
```

**3. JWT_SECRET 未设置**
```bash
# 生成并设置密钥
echo "$(node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")" | npx wrangler secret put JWT_SECRET
```

**4. 本地开发端口冲突**
```bash
# 使用其他端口
npm run dev -- --port 8788
```

### 查看日志

```bash
# 实时查看 Worker 日志
npm run tail

# 或
npx wrangler tail
```

## 📖 详细文档

- [DEPLOYMENT.md](./DEPLOYMENT.md) - 详细部署指南（包括常见问题）
- [DEPLOYMENT_SUMMARY.md](./DEPLOYMENT_SUMMARY.md) - 部署总结和最佳实践

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📝 License

MIT
