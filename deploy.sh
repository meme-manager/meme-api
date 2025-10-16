#!/bin/bash

# 表情包管理工具 - Cloudflare Workers 一键部署脚本
# 使用方法: ./deploy.sh

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示标题
show_banner() {
    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║   表情包管理工具 - Cloudflare Workers 一键部署         ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        log_error "未找到 Node.js,请先安装 Node.js 18+"
        exit 1
    fi
    
    # 检查 pnpm
    if ! command -v pnpm &> /dev/null; then
        log_warning "未找到 pnpm,尝试使用 npm..."
        NPM_CMD="npm"
    else
        NPM_CMD="pnpm"
    fi
    
    log_success "依赖检查完成"
}

# 安装依赖
install_dependencies() {
    log_info "安装项目依赖..."
    $NPM_CMD install
    log_success "依赖安装完成"
}

# 登录 Cloudflare
login_cloudflare() {
    log_info "登录 Cloudflare..."
    
    if npx wrangler whoami &> /dev/null; then
        log_success "已登录 Cloudflare"
        return 0
    fi
    
    log_warning "需要登录 Cloudflare,浏览器将打开授权页面..."
    npx wrangler login
    
    if npx wrangler whoami &> /dev/null; then
        log_success "登录成功"
    else
        log_error "登录失败"
        exit 1
    fi
}

# 创建 D1 数据库
create_d1_database() {
    log_info "创建 D1 数据库..."
    
    # 检查数据库是否已存在
    if npx wrangler d1 list | grep -q "meme-db"; then
        log_warning "数据库 meme-db 已存在,跳过创建"
        
        # 获取数据库 ID
        DB_ID=$(npx wrangler d1 list | grep "meme-db" | awk '{print $2}')
        log_info "数据库 ID: $DB_ID"
    else
        # 创建数据库
        log_info "创建新数据库 meme-db..."
        CREATE_OUTPUT=$(npx wrangler d1 create meme-db)
        
        # 提取数据库 ID
        DB_ID=$(echo "$CREATE_OUTPUT" | grep "database_id" | sed 's/.*database_id = "\(.*\)"/\1/')
        
        if [ -z "$DB_ID" ]; then
            log_error "无法获取数据库 ID"
            exit 1
        fi
        
        log_success "数据库创建成功,ID: $DB_ID"
    fi
    
    # 更新 wrangler.toml
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/database_id = \"\"/database_id = \"$DB_ID\"/" wrangler.toml
    else
        # Linux
        sed -i "s/database_id = \"\"/database_id = \"$DB_ID\"/" wrangler.toml
    fi
    
    log_success "wrangler.toml 已更新"
}

# 运行数据库迁移
run_migrations() {
    log_info "运行数据库迁移..."
    
    if [ ! -d "migrations" ]; then
        log_error "未找到 migrations 目录"
        exit 1
    fi
    
    # 执行所有迁移文件
    for migration in migrations/*.sql; do
        if [ -f "$migration" ]; then
            log_info "执行迁移: $(basename $migration)"
            npx wrangler d1 execute meme-db --file="$migration" --remote
        fi
    done
    
    log_success "数据库迁移完成"
}

# 创建 R2 存储桶
create_r2_bucket() {
    log_info "创建 R2 存储桶..."
    
    # 检查存储桶是否已存在
    if npx wrangler r2 bucket list | grep -q "meme-storage"; then
        log_warning "存储桶 meme-storage 已存在,跳过创建"
    else
        npx wrangler r2 bucket create meme-storage
        log_success "R2 存储桶创建成功"
    fi
}

# 生成并设置 JWT 密钥
setup_jwt_secret() {
    log_info "设置 JWT 密钥..."
    
    # 生成随机密钥
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    log_info "生成的 JWT 密钥: ${JWT_SECRET:0:16}..."
    
    # 设置密钥
    echo "$JWT_SECRET" | npx wrangler secret put JWT_SECRET
    
    # 创建 .dev.vars 文件用于本地开发
    echo "JWT_SECRET=$JWT_SECRET" > .dev.vars
    log_success "JWT 密钥设置完成"
}

# 部署 Workers
deploy_workers() {
    log_info "部署 Workers..."
    
    npx wrangler deploy
    
    log_success "Workers 部署成功!"
}

# 显示部署信息
show_deployment_info() {
    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║                  🎉 部署成功!                          ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""
    
    # 获取 Workers URL
    WORKER_URL=$(npx wrangler deployments list 2>/dev/null | grep "https://" | head -1 | awk '{print $1}')
    
    if [ -z "$WORKER_URL" ]; then
        WORKER_URL="https://meme-api.<your-subdomain>.workers.dev"
    fi
    
    log_info "Workers URL: $WORKER_URL"
    echo ""
    log_info "下一步操作:"
    echo "  1. 在桌面应用的设置中配置服务器地址: $WORKER_URL"
    echo "  2. 输入设备名称并登录"
    echo "  3. 开始使用云同步功能!"
    echo ""
    log_info "本地开发:"
    echo "  运行: npm run dev"
    echo "  地址: http://localhost:8787"
    echo ""
    log_info "查看日志:"
    echo "  运行: npx wrangler tail"
    echo ""
}

# 主函数
main() {
    show_banner
    
    # 确认部署
    read -p "$(echo -e ${YELLOW}是否开始部署到 Cloudflare? [y/N]: ${NC})" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "部署已取消"
        exit 0
    fi
    
    # 执行部署步骤
    check_dependencies
    install_dependencies
    login_cloudflare
    create_d1_database
    run_migrations
    create_r2_bucket
    setup_jwt_secret
    deploy_workers
    show_deployment_info
    
    log_success "所有步骤完成!"
}

# 运行主函数
main
