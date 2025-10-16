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

# 检查数据库是否存在
log_info "检查 D1 数据库状态..."
DB_EXISTS=false
if npx wrangler d1 list 2>/dev/null | grep -q "meme-db"; then
    log_success "数据库 meme-db 已存在"
    DB_EXISTS=true
    
    # 获取数据库 ID
    DB_ID=$(npx wrangler d1 list | grep "meme-db" | awk '{print $2}')
    log_info "数据库 ID: $DB_ID"
else
    log_warning "数据库 meme-db 不存在"
    log_info "Cloudflare 将在部署时自动创建数据库"
fi
echo ""

# 检查 R2 存储桶
log_info "检查 R2 存储桶..."
if npx wrangler r2 bucket list 2>/dev/null | grep -q "meme-storage"; then
    log_success "R2 存储桶 meme-storage 已存在"
else
    log_warning "R2 存储桶不存在,Cloudflare 将自动创建"
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

# 等待并检查数据库是否创建完成
if [ "$DB_EXISTS" = false ]; then
    log_info "等待 Cloudflare 创建数据库..."
    
    MAX_WAIT=60  # 最多等待60秒
    WAIT_INTERVAL=5  # 每5秒检查一次
    ELAPSED=0
    
    while [ $ELAPSED -lt $MAX_WAIT ]; do
        sleep $WAIT_INTERVAL
        ELAPSED=$((ELAPSED + WAIT_INTERVAL))
        
        # 检查数据库是否已创建
        if npx wrangler d1 list 2>/dev/null | grep -q "meme-db"; then
            log_success "数据库创建完成! (用时 ${ELAPSED}s)"
            DB_EXISTS=true
            break
        else
            log_info "等待中... (${ELAPSED}s/${MAX_WAIT}s)"
        fi
    done
    
    if [ "$DB_EXISTS" = false ]; then
        log_warning "数据库创建超时,但将继续尝试迁移"
    fi
    
    echo ""
fi

# 运行数据库迁移
log_info "运行数据库迁移..."
MIGRATION_SUCCESS=false
MAX_RETRIES=5  # 增加重试次数
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
            
            # 如果是因为数据库不存在,等待更久一点
            if [ $RETRY_COUNT -eq 1 ]; then
                log_info "检查数据库状态..."
                if npx wrangler d1 list 2>/dev/null | grep -q "meme-db"; then
                    log_info "数据库已存在,可能正在初始化..."
                else
                    log_warning "数据库仍未创建,继续等待..."
                fi
            fi
            
            sleep 5  # 每次重试等待5秒
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
else
    echo "  3. 在桌面应用中配置服务器地址"
fi
echo ""
log_success "部署流程完成!"
