#!/bin/bash

# 测试部署脚本 - 只检查环境,不实际部署

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║          部署环境检查 (测试模式)                       ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# 检查 Node.js
log_info "检查 Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    log_success "Node.js 已安装: $NODE_VERSION"
else
    log_error "未找到 Node.js"
    exit 1
fi

# 检查 npm/pnpm
log_info "检查包管理器..."
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm -v)
    log_success "pnpm 已安装: $PNPM_VERSION"
    NPM_CMD="pnpm"
elif command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    log_success "npm 已安装: $NPM_VERSION"
    NPM_CMD="npm"
else
    log_error "未找到 npm 或 pnpm"
    exit 1
fi

# 检查 wrangler
log_info "检查 Wrangler..."
if npx wrangler --version &> /dev/null; then
    WRANGLER_VERSION=$(npx wrangler --version 2>&1 | head -1)
    log_success "Wrangler 可用: $WRANGLER_VERSION"
else
    log_error "Wrangler 不可用"
    exit 1
fi

# 检查登录状态
log_info "检查 Cloudflare 登录状态..."
if npx wrangler whoami &> /dev/null; then
    ACCOUNT=$(npx wrangler whoami 2>&1 | grep "Account Name" | cut -d: -f2 | xargs)
    log_success "已登录 Cloudflare: $ACCOUNT"
else
    log_info "未登录 Cloudflare (部署时会提示登录)"
fi

# 检查配置文件
log_info "检查配置文件..."
if [ -f "wrangler.toml" ]; then
    log_success "wrangler.toml 存在"
else
    log_error "未找到 wrangler.toml"
    exit 1
fi

# 检查迁移文件
log_info "检查数据库迁移..."
if [ -d "migrations" ]; then
    MIGRATION_COUNT=$(ls migrations/*.sql 2>/dev/null | wc -l | xargs)
    log_success "找到 $MIGRATION_COUNT 个迁移文件"
else
    log_error "未找到 migrations 目录"
    exit 1
fi

# 检查源代码
log_info "检查源代码..."
if [ -d "src" ]; then
    log_success "src 目录存在"
else
    log_error "未找到 src 目录"
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║          ✅ 环境检查通过!                              ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
log_info "可以运行: ./deploy.sh 开始部署"
echo ""
