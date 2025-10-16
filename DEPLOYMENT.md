# Meme API 部署指南

本文档详细说明如何部署 meme-api 项目到 Cloudflare Workers。

## 🎯 部署方式

### 方式一：一键部署（推荐）

**适合人群**: 新用户、快速上手

1. 点击仓库首页的 **Deploy to Cloudflare** 按钮
2. Cloudflare 会自动：
   - Fork 仓库到你的 GitHub 账户
   - 创建 D1 数据库和 R2 存储桶
   - 自动绑定资源并部署
   - 配置 CI/CD 自动部署
3. 部署时会提示设置 `JWT_SECRET`，生成方法：
   ```bash
   openssl rand -hex 32
   # 或
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

**工作原理**:
- Cloudflare 读取 `wrangler.toml` 配置
- 自动创建 D1 数据库（ID：自动生成）
- 自动创建 R2 存储桶
- 执行 `npm run deploy` 命令
- 自动运行数据库迁移
- 部署 Worker 到 Cloudflare 网络

### 方式二：手动部署

**适合人群**: 需要自定义配置、多环境部署

#### 前提条件

- Node.js 18+
- 已安装 npm 或 pnpm
- 有 Cloudflare 账户

#### 部署步骤

1. **克隆仓库**
   ```bash
   git clone <your-repo-url>
   cd meme-api
   ```

2. **运行部署脚本**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

3. **脚本会自动完成**：
   - 检查依赖和环境
   - 登录 Cloudflare（首次需要浏览器授权）
   - 创建 D1 数据库和 R2 存储桶
   - 生成 `wrangler.local.toml` 配置（包含真实资源 ID）
   - 生成 JWT 密钥并设置为 Secret
   - 运行数据库迁移
   - 部署 Worker

4. **部署完成后**，脚本会显示 Worker URL，记录下来用于客户端配置

## 📁 配置文件说明

### 三个配置文件

| 文件 | 用途 | 是否提交 Git | 说明 |
|------|------|-------------|------|
| `wrangler.toml` | 一键部署配置 | ✅ 是 | 包含占位符，Cloudflare 自动替换 |
| `wrangler.toml.example` | 配置模板 | ✅ 是 | 手动部署时的参考模板 |
| `wrangler.local.toml` | 本地配置 | ❌ 否 | 包含真实资源 ID，自动生成 |

### 环境变量文件

| 文件 | 用途 | 是否提交 Git |
|------|------|-------------|
| `.dev.vars.example` | 环境变量示例 | ✅ 是 |
| `.dev.vars` | 本地开发环境变量 | ❌ 否 |

## 🔐 敏感信息保护

### 已忽略的文件（不会提交到 Git）

- `.dev.vars` - 本地 JWT 密钥
- `wrangler.local.toml` - 包含真实资源 ID
- `.wrangler/` - Wrangler 缓存目录
- `node_modules/` - 依赖包
- `package-lock.json` - 锁文件

### 安全的文件（可以提交到 Git）

- `wrangler.toml` - 只包含占位符 ID
- `wrangler.toml.example` - 配置模板
- `.dev.vars.example` - 环境变量示例

## 🔄 CI/CD 配置

### 一键部署用户

使用 Cloudflare 自带的 **Workers Builds** CI/CD：
- 每次 push 到 main 分支自动触发
- 在 Cloudflare Dashboard 查看部署日志
- 无需额外配置

### 手动部署用户（GitHub Actions）

1. **获取 Cloudflare API Token**
   - 访问: https://dash.cloudflare.com/profile/api-tokens
   - 创建 Token，使用 "Edit Cloudflare Workers" 模板
   - 确保包含以下权限：
     - Workers Scripts: Edit
     - D1: Edit
     - Account Settings: Read

2. **获取 Account ID**
   - 在 Cloudflare Dashboard 右侧边栏
   - 复制 Account ID

3. **配置 GitHub Secrets**
   - 仓库 Settings → Secrets and variables → Actions
   - 添加 secrets：
     - `CLOUDFLARE_API_TOKEN`: 你的 API Token
     - `CLOUDFLARE_ACCOUNT_ID`: 你的 Account ID

4. **配置完成**
   - GitHub Actions 会在每次 push 到 main 时自动部署
   - 在 Actions 标签页查看部署日志

## 🧪 本地开发

### 启动开发服务器

```bash
# 安装依赖
npm install

# 初始化本地数据库
npm run db:migrate:local

# 启动开发服务器
npm run dev
```

访问: http://localhost:8787

### 本地开发特点

- 使用本地数据库（SQLite）
- 使用本地 R2 模拟器
- 数据持久化在 `.wrangler/state/` 目录
- 不需要连接 Cloudflare 账户

## 🔍 部署验证

### 测试 API

```bash
# 健康检查
curl https://your-worker.workers.dev/health

# 设备注册
curl -X POST https://your-worker.workers.dev/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "device_name": "Test Device",
    "device_type": "desktop",
    "platform": "macos"
  }'
```

### 查看日志

```bash
# 实时日志
npx wrangler tail

# 或使用 npm script
npm run tail
```

## 🚨 常见问题

### 1. 一键部署失败

**原因**: database_id 配置问题  
**解决**: 检查 `wrangler.toml` 中 database_id 是否为占位符 UUID

### 2. 数据库迁移失败

**原因**: 数据库 ID 不正确  
**解决**: 
- 手动部署: 删除 `wrangler.local.toml`，重新运行 `./deploy.sh`
- 一键部署: 在 Cloudflare Dashboard 检查 D1 数据库是否创建成功

### 3. JWT 密钥未设置

**原因**: 环境变量未配置  
**解决**:
```bash
# 生成密钥
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 设置 Secret
echo "$JWT_SECRET" | npx wrangler secret put JWT_SECRET
```

### 4. R2 存储桶访问失败

**原因**: R2 存储桶未创建或绑定错误  
**解决**: 在 Cloudflare Dashboard → R2 → 检查存储桶是否存在

## 📞 获取帮助

- 查看部署日志
- 检查 Cloudflare Dashboard
- 提交 Issue 到 GitHub 仓库

## 🎉 部署成功后

1. 在桌面应用设置中配置服务器地址
2. 输入设备名称并登录
3. 开始使用云同步功能！
