#!/bin/bash

# 自动部署脚本 - 网页版部署时自动运行
# 自动检测并创建数据库,运行迁移,部署 Worker

echo "🚀 开始自动部署..."

# 检查数据库是否存在
echo "🔍 检查数据库状态..."
if wrangler d1 list 2>/dev/null | grep -q "meme-db"; then
    echo "✅ 数据库已存在"
    DB_EXISTS=true
else
    echo "📦 数据库不存在,尝试创建..."
    # 尝试创建数据库(可能会失败,因为 Cloudflare 可能正在创建)
    wrangler d1 create meme-db 2>/dev/null || echo "⚠️  数据库创建失败或正在由 Cloudflare 创建"
    DB_EXISTS=false
fi

# 部署 Worker
echo "🌐 部署 Worker..."
wrangler deploy

# 等待一下,让 Cloudflare 完成数据库创建
if [ "$DB_EXISTS" = false ]; then
    echo "⏳ 等待数据库创建完成..."
    sleep 3
fi

# 运行数据库迁移
echo "📊 运行数据库迁移..."
if wrangler d1 migrations apply DB --remote 2>/dev/null; then
    echo "✅ 数据库迁移完成"
else
    echo "⚠️  数据库迁移失败,请稍后手动运行: npm run db:migrations:apply"
fi

echo "✅ 部署完成!"
