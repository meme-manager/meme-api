#!/bin/bash

# Cloudflare Workers 自动部署脚本
# 在网页版部署时自动运行,处理数据库迁移和 Worker 部署

set -e  # 遇到错误立即退出

echo "🚀 开始部署 Meme API..."

# 步骤 1: 运行数据库迁移
echo "📦 运行数据库迁移..."
if wrangler d1 migrations apply DB --remote 2>/dev/null; then
    echo "✅ 数据库迁移完成"
else
    echo "⚠️  数据库迁移失败或数据库尚未创建,将在首次请求时初始化"
fi

# 步骤 2: 部署 Worker
echo "🌐 部署 Worker..."
wrangler deploy

echo "✅ 部署完成!"
