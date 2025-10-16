# Meme Manager - Workers API

Cloudflare Workers API for Meme Manager

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/meme-manager/meme-api)

## 🚀 快速部署

### 一键部署 (推荐)

点击上面的 **Deploy to Cloudflare** 按钮,Cloudflare 会自动:

1. **Fork 仓库** - 复制代码到你的 GitHub 账户
2. **创建资源** - 自动创建 D1 数据库和 R2 存储桶
3. **配置绑定** - 自动绑定资源到 Worker
4. **运行迁移** - 执行数据库迁移脚本
5. **部署上线** - 部署到 Cloudflare 网络
6. **设置 CI/CD** - 配置自动部署流程

**你只需要**:
- 设置 `JWT_SECRET` 密钥(部署时会提示如何生成)
- 等待几分钟完成部署

**工作原理**:
- Cloudflare 读取 `wrangler.json` 配置文件
- 自动创建所需的 D1 数据库和 R2 存储桶
- 运行 `package.json` 中的 `deploy` 脚本
- `deploy` 脚本会先执行数据库迁移,然后部署 Worker
- **自动配置 CI/CD**: 每次 push 到 main 分支会自动重新部署

### 命令行部署

如果你想手动部署:

```bash
./deploy.sh
```

脚本会自动:
- 创建 D1 数据库和 R2 存储桶
- 从 `wrangler.toml.example` 生成配置文件
- 自动填入资源 ID
- 运行数据库迁移
- 部署到 Cloudflare Workers

**注意**: `wrangler.toml` 包含你的资源 ID,已加入 `.gitignore`,不会被提交到 Git

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

### 配置文件

项目使用 `wrangler.toml.example` 作为配置模板:
- **不要直接修改** `wrangler.toml.example`
- 部署脚本会自动从模板创建 `wrangler.toml`
- `wrangler.toml` 包含你的资源 ID,不会被提交到 Git

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

## 📝 License

MIT
