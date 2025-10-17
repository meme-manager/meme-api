#!/bin/bash

# 自动部署脚本 - 网页版部署时自动运行
# 自动检测并创建数据库,运行迁移,部署 Worker

set -e  # 部署失败时退出

echo "🚀 开始自动部署 Meme API..."
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# 检查 wrangler
log_info "检查 wrangler..."
if ! command -v npx &> /dev/null; then
    log_error "未找到 npx 命令"
    exit 1
fi

if ! npx wrangler --version &> /dev/null; then
    log_error "wrangler 未安装或无法运行"
    exit 1
fi
log_success "wrangler 检查通过"
echo ""

# 检查并创建数据库
log_info "检查 D1 数据库状态..."
DB_ID=""

if npx wrangler d1 list 2>/dev/null | grep -q "meme-db"; then
    log_success "数据库 meme-db 已存在"
    
    # 获取数据库 ID
    DB_ID=$(npx wrangler d1 list | grep "meme-db" | awk '{print $2}')
    log_info "数据库 ID: $DB_ID"
else
    log_warning "数据库 meme-db 不存在,开始创建..."
    
    # 创建数据库
    CREATE_OUTPUT=$(npx wrangler d1 create meme-db 2>&1)
    
    if echo "$CREATE_OUTPUT" | grep -q "database_id"; then
        # 提取数据库 ID
        DB_ID=$(echo "$CREATE_OUTPUT" | grep "database_id" | sed 's/.*database_id = "\(.*\)"/\1/' | tr -d '[:space:]')
        log_success "数据库创建成功!"
        log_info "数据库 ID: $DB_ID"
    else
        log_error "数据库创建失败"
        echo "$CREATE_OUTPUT"
        exit 1
    fi
fi

# 验证数据库 ID
if [ -z "$DB_ID" ]; then
    log_error "无法获取数据库 ID"
    exit 1
fi
echo ""

# 更新 wrangler.toml 配置
log_info "更新 wrangler.toml 配置..."
if [ -f "wrangler.toml" ]; then
    # 备份原配置
    cp wrangler.toml wrangler.toml.backup 2>/dev/null || true
    
    # 检查是否已经有 database_id
    if grep -q "database_id = \"\"" wrangler.toml; then
        # 替换空的 database_id
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/database_id = \"\"/database_id = \"$DB_ID\"/" wrangler.toml
        else
            sed -i "s/database_id = \"\"/database_id = \"$DB_ID\"/" wrangler.toml
        fi
        log_success "已更新 database_id"
    elif grep -q "database_id" wrangler.toml; then
        log_info "database_id 已存在,跳过更新"
    else
        # 在 database_name 后添加 database_id
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "/database_name = \"meme-db\"/a\\
database_id = \"$DB_ID\"
" wrangler.toml
        else
            sed -i "/database_name = \"meme-db\"/a database_id = \"$DB_ID\"" wrangler.toml
        fi
        log_success "已添加 database_id"
    fi
else
    log_warning "未找到 wrangler.toml,跳过配置更新"
fi
echo ""

# 检查并创建 R2 存储桶
log_info "检查 R2 存储桶..."
if npx wrangler r2 bucket list 2>/dev/null | grep -q "meme-storage"; then
    log_success "R2 存储桶 meme-storage 已存在"
else
    log_warning "R2 存储桶不存在,开始创建..."
    if npx wrangler r2 bucket create meme-storage; then
        log_success "R2 存储桶创建成功!"
    else
        log_warning "R2 存储桶创建失败,但将继续部署"
    fi
fi
echo ""

# 设置 JWT_SECRET
log_info "检查 JWT_SECRET..."
# 生成一个随机的 64 位十六进制字符串
JWT_SECRET=$(openssl rand -hex 32)

if [ -z "$JWT_SECRET" ]; then
    log_error "生成 JWT_SECRET 失败"
    exit 1
fi

log_info "设置 JWT_SECRET 环境变量..."
# 使用 wrangler secret put 设置 JWT_SECRET
echo "$JWT_SECRET" | npx wrangler secret put JWT_SECRET > /dev/null 2>&1

if [ $? -eq 0 ]; then
    log_success "JWT_SECRET 设置成功"
else
    log_warning "JWT_SECRET 设置失败，将在部署后手动设置"
fi
echo ""

# 部署 Worker
log_info "开始部署 Worker..."
if npx wrangler deploy; then
    log_success "Worker 部署成功!"
else
    log_error "Worker 部署失败"
    exit 1
fi
echo ""

# 运行数据库迁移
log_info "运行数据库迁移..."
MIGRATION_SUCCESS=false
MAX_RETRIES=3
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if npx wrangler d1 migrations apply DB --remote 2>/dev/null; then
        log_success "数据库迁移完成!"
        MIGRATION_SUCCESS=true
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            log_warning "迁移失败,重试 $RETRY_COUNT/$MAX_RETRIES..."
            sleep 3
        fi
    fi
done

echo ""

if [ "$MIGRATION_SUCCESS" = false ]; then
    log_warning "数据库迁移失败"
    log_info "可能原因:"
    echo "  1. 数据库还在创建中"
    echo "  2. wrangler.toml 配置问题"
    echo ""
    log_info "请稍后手动运行迁移:"
    echo "  npm run db:migrations:apply"
    echo ""
fi

# 显示部署信息
echo "╔════════════════════════════════════════════════════════╗"
echo "║                  部署完成!                             ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

log_info "下一步:"
echo "  1. 访问 Cloudflare Dashboard 查看 Worker URL"
echo "  2. 测试健康检查: curl https://your-worker.workers.dev/health"
if [ "$MIGRATION_SUCCESS" = false ]; then
    echo "  3. 运行数据库迁移: npm run db:migrations:apply"
    echo "  4. 登录管理员面板设置同步密码（默认管理员密码: admin）"
else
    echo "  3. 登录管理员面板设置同步密码（默认管理员密码: admin）"
    echo "  4. 在桌面应用中配置服务器地址"
fi
echo ""
log_success "部署流程完成!"
echo ""
log_info "安全提示:"
echo "  ✅ JWT_SECRET 已自动生成并设置为 Worker Secret"
echo "  ⚠️ 请立即修改管理员密码（默认: admin）"
echo "  ⚠️ 设置强同步密码以保护服务器"
