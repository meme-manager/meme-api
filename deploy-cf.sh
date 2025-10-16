#!/bin/bash

# Cloudflare 首次部署脚本
# 该脚本将引导你完成 meme-api 的首次部署流程

# 函数：打印日志
log_info() {
    echo "[INFO] $1"
}

# 函数：打印错误
log_error() {
    echo "[ERROR] $1" >&2
    exit 1
}

# 检查 wrangler 是否安装
if ! command -v npx wrangler &> /dev/null; then
    log_error "Wrangler 未安装或不在你的 PATH 中。请先运行 'npm install -g wrangler'。"
fi

# --- 1. 定义资源名称 ---
# 你可以在这里修改为你想要的名称
WORKER_NAME="meme-api"
DB_NAME="meme-db"
R2_BUCKET_NAME="meme-storage"

log_info "将使用以下名称创建资源:"
log_info "- Worker: $WORKER_NAME"
log_info "- D1 Database: $DB_NAME"
log_info "- R2 Bucket: $R2_BUCKET_NAME"
echo ""

# --- 2. 创建 D1 数据库 ---
log_info "正在创建 D1 数据库: $DB_NAME..."
D1_CREATE_OUTPUT=$(npx wrangler d1 create $DB_NAME)
if [ $? -ne 0 ]; then
    log_error "创建 D1 数据库失败。错误信息如下:\n$D1_CREATE_OUTPUT"
fi
log_info "D1 数据库创建成功。"
echo "$D1_CREATE_OUTPUT" >> wrangler.toml
DB_UUID=$(echo "$D1_CREATE_OUTPUT" | grep -o 'database_id = ".*"' | cut -d '"' -f 2)
log_info "数据库 ID: $DB_UUID"
echo ""

# --- 3. 创建 R2 存储桶 ---
log_info "正在创建 R2 存储桶: $R2_BUCKET_NAME..."
if ! npx wrangler r2 bucket create $R2_BUCKET_NAME; then
    log_error "创建 R2 存储桶失败。请检查名称是否唯一。"
fi
log_info "R2 存储桶创建成功。"
echo ""

# --- 4. 执行数据库迁移 ---
log_info "正在执行数据库迁移..."
if ! npx wrangler d1 execute $DB_NAME --file=./migrations/0001_initial.sql; then
    log_error "数据库迁移失败。"
fi
log_info "数据库迁移成功。"
echo ""

# --- 5. 部署 Worker ---
log_info "正在部署 Worker: $WORKER_NAME..."
if ! npx wrangler deploy --name $WORKER_NAME; then
    log_error "Worker 部署失败。"
fi

# --- 部署成功 ---
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║                  🎉 部署成功!                          ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

WORKER_URL=$(npx wrangler deployments list | grep -o 'https://[a-zA-Z0-9.-]*workers.dev' | head -n 1)

log_info "你的 API 地址是: $WORKER_URL"
log_info "现在你可以将此地址配置到你的客户端应用中了。"
echo ""
