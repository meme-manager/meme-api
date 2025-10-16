# Meme Manager API 接口文档

## 概述

**项目名称**: Meme Manager API  
**版本**: 1.0.0  
**基础URL**: `https://your-domain.workers.dev`  
**架构**: Cloudflare Workers + D1 Database + R2 Storage

## 认证方式

大部分接口需要在请求头中携带 JWT Token：

```
Authorization: Bearer <token>
```

## 全局响应格式

### 成功响应
```json
{
  "success": true,
  "data": {...},
  "message": "操作成功"
}
```

### 错误响应
```json
{
  "success": false,
  "error": "错误信息",
  "code": 400
}
```

---

## 1. 系统接口

### 1.1 获取 API 信息
获取 API 基本信息和健康状态。

**请求**
- 方法: `GET`
- 路径: `/`
- 认证: 不需要

**响应**
```json
{
  "name": "Meme Manager API",
  "version": "1.0.0",
  "status": "ok",
  "timestamp": 1697520000000
}
```

---

### 1.2 健康检查
检查 API 服务状态。

**请求**
- 方法: `GET`
- 路径: `/health`
- 认证: 不需要

**响应**
```json
{
  "status": "ok",
  "timestamp": 1697520000000
}
```

---

## 2. 认证接口

### 2.1 设备注册/登录
设备首次注册或已注册设备登录。

**请求**
- 方法: `POST`
- 路径: `/auth/device-register`
- 认证: 不需要
- Content-Type: `application/json`

**请求体**
```json
{
  "device_id": "uuid-optional",    // 可选，若不提供则自动生成
  "device_name": "iPhone 14",      // 必填
  "device_type": "mobile",         // 必填：mobile/desktop/tablet
  "platform": "ios"                // 必填：ios/android/windows/macos/linux
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "token": "jwt-token-string",
    "user_id": "user-uuid",
    "device_id": "device-uuid",
    "expires_at": 1700112000000
  },
  "message": "注册成功"  // 或 "登录成功"
}
```

**说明**
- 新设备首次注册时会创建新用户
- 已注册设备会更新设备信息并返回新 Token
- Token 有效期为 30 天

---

### 2.2 获取用户信息
获取当前登录用户的信息。

**请求**
- 方法: `GET`
- 路径: `/auth/me`
- 认证: **需要**

**响应**
```json
{
  "success": true,
  "data": {
    "user_id": "user-uuid",
    "created_at": 1697520000000,
    "last_login_at": 1697520000000,
    "storage_used": 10485760
  }
}
```

---

## 3. 数据同步接口

### 3.1 拉取云端更新
从云端拉取指定时间后的所有更新数据。

**请求**
- 方法: `POST`
- 路径: `/sync/pull`
- 认证: **需要**
- Content-Type: `application/json`

**请求体**
```json
{
  "since": 1697520000000  // 时间戳，获取此时间之后的更新，0 表示全量拉取
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "assets": [
      {
        "id": "asset-uuid",
        "user_id": "user-uuid",
        "content_hash": "sha256-hash",
        "file_name": "meme.jpg",
        "mime_type": "image/jpeg",
        "file_size": 102400,
        "width": 800,
        "height": 600,
        "r2_key": "user-id/assets/hash.jpg",
        "thumb_r2_key": "user-id/thumbs/hash_256.webp",
        "is_favorite": 0,
        "favorited_at": null,
        "use_count": 5,
        "last_used_at": 1697520000000,
        "created_at": 1697520000000,
        "updated_at": 1697520000000,
        "deleted": 0,
        "deleted_at": null
      }
    ],
    "tags": [
      {
        "id": "tag-uuid",
        "user_id": "user-uuid",
        "name": "搞笑",
        "color": "#FF5733",
        "use_count": 10,
        "created_at": 1697520000000,
        "updated_at": 1697520000000
      }
    ],
    "asset_tags": [
      {
        "asset_id": "asset-uuid",
        "tag_id": "tag-uuid",
        "created_at": 1697520000000
      }
    ],
    "settings": [
      {
        "user_id": "user-uuid",
        "key": "theme",
        "value": "dark",
        "updated_at": 1697520000000
      }
    ],
    "server_timestamp": 1697520000000,
    "total_count": 25
  }
}
```

---

### 3.2 推送本地更新
将本地更新的数据推送到云端。

**请求**
- 方法: `POST`
- 路径: `/sync/push`
- 认证: **需要**
- Content-Type: `application/json`

**请求体**
```json
{
  "assets": [
    {
      "id": "asset-uuid",
      "user_id": "user-uuid",
      "content_hash": "sha256-hash",
      "file_name": "meme.jpg",
      "mime_type": "image/jpeg",
      "file_size": 102400,
      "width": 800,
      "height": 600,
      "r2_key": "user-id/assets/hash.jpg",
      "thumb_r2_key": "user-id/thumbs/hash_256.webp",
      "is_favorite": 1,
      "favorited_at": 1697520000000,
      "use_count": 5,
      "last_used_at": 1697520000000,
      "created_at": 1697520000000,
      "updated_at": 1697520000000,
      "deleted": 0,
      "deleted_at": null
    }
  ],
  "tags": [...],           // 可选
  "asset_tags": [...],     // 可选
  "settings": [...]        // 可选
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "success": true,
    "synced_count": 25,
    "server_timestamp": 1697520000000
  },
  "message": "同步成功"
}
```

**说明**
- 采用 UPSERT 策略，根据时间戳判断是否更新
- 会检查用户配额限制
- 自动更新用户存储使用量

---

## 4. 分享接口

### 4.1 创建分享
创建一个表情包分享链接。

**请求**
- 方法: `POST`
- 路径: `/share/create`
- 认证: **需要**
- Content-Type: `application/json`

**请求体**
```json
{
  "asset_ids": ["asset-uuid-1", "asset-uuid-2"],  // 必填，至少一个
  "title": "搞笑表情包合集",                       // 可选
  "description": "2024年最新搞笑表情包",           // 可选
  "expires_in": 86400,                            // 可选，过期时间（秒），null 表示永不过期
  "max_downloads": 100,                           // 可选，最大下载次数，null 表示无限制
  "password": "123456"                            // 可选，访问密码
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "share_id": "abc12345",
    "share_url": "https://your-domain.workers.dev/s/abc12345",
    "expires_at": 1697606400000
  },
  "message": "分享创建成功"
}
```

**说明**
- 会检查每日分享次数限制
- 自动复制图片到公共分享目录
- 生成 8 位短 ID

---

### 4.2 获取分享详情
获取分享链接的详细信息和资产列表。

**请求**
- 方法: `GET`
- 路径: `/share/:shareId`
- 认证: 不需要
- Query 参数:
  - `password`: 可选，分享密码

**示例**: `/share/abc12345?password=123456`

**响应**
```json
{
  "success": true,
  "data": {
    "title": "搞笑表情包合集",
    "description": "2024年最新搞笑表情包",
    "assets": [
      {
        "id": "asset-uuid",
        "file_name": "meme.jpg",
        "mime_type": "image/jpeg",
        "width": 800,
        "height": 600,
        "thumb_url": "https://your-domain.workers.dev/r2/shared/abc12345/hash_thumb.webp",
        "download_url": "https://your-domain.workers.dev/r2/shared/abc12345/hash.jpg"
      }
    ],
    "expires_at": 1697606400000,
    "view_count": 42
  }
}
```

**错误码**
- `401`: 需要密码或密码错误
- `403`: 已达到最大下载次数
- `404`: 分享不存在
- `410`: 分享已过期
- `429`: 查看次数超限

---

### 4.3 分享预览页面
访问分享的 Web 页面（HTML）。

**请求**
- 方法: `GET`
- 路径: `/s/:shareId`
- 认证: 不需要

**响应**: 返回 HTML 页面，包含：
- 标题和描述
- 图片网格展示
- 查看和下载统计
- 一键导入功能
- 批量下载功能

---

### 4.4 获取我的分享列表
获取当前用户创建的所有分享。

**请求**
- 方法: `GET`
- 路径: `/share/list`
- 认证: **需要**

**响应**
```json
{
  "success": true,
  "data": {
    "shares": [
      {
        "share_id": "abc12345",
        "title": "搞笑表情包合集",
        "view_count": 42,
        "download_count": 15,
        "created_at": 1697520000000,
        "expires_at": 1697606400000,
        "asset_count": 10
      }
    ]
  }
}
```

---

### 4.5 删除分享
删除指定的分享。

**请求**
- 方法: `DELETE`
- 路径: `/share/:shareId`
- 认证: **需要**

**响应**
```json
{
  "success": true,
  "data": {
    "success": true
  },
  "message": "分享已删除"
}
```

**说明**
- 仅分享创建者可以删除
- 会同时删除 R2 中的共享文件

---

### 4.6 导入分享
统计分享导入次数（用于应用内导入）。

**请求**
- 方法: `POST`
- 路径: `/share/:shareId/import`
- 认证: 不需要

**响应**
```json
{
  "success": true,
  "data": {
    "success": true,
    "imported_count": 10,
    "assets": [
      {
        "id": "asset-uuid",
        "download_url": "/r2/shared/abc12345/hash.jpg"
      }
    ]
  },
  "message": "导入成功"
}
```

**说明**
- 会增加分享的下载计数
- 返回资产下载链接供客户端使用

---

## 5. 配额管理接口

### 5.1 获取配额信息
获取当前用户的配额使用情况。

**请求**
- 方法: `GET`
- 路径: `/quota/info`
- 认证: **需要**

**响应**
```json
{
  "success": true,
  "data": {
    "assets": {
      "used": 150,
      "limit": 10000,
      "percentage": 2
    },
    "storage": {
      "used": 52428800,        // 字节
      "limit": 1073741824,     // 1GB
      "percentage": 5
    },
    "shares": {
      "used": 5,
      "limit": 100,
      "percentage": 5
    }
  }
}
```

**配额限制**
- 资产数量上限: 10,000 个
- 存储空间上限: 1 GB
- 分享数量上限: 100 个

---

## 6. 文件存储接口

### 6.1 获取 R2 文件
通过 R2 key 获取文件内容。

**请求**
- 方法: `GET`
- 路径: `/r2/*`
- 认证: 不需要

**示例**
- `/r2/user-id/assets/hash.jpg` - 用户资产
- `/r2/user-id/thumbs/hash_256.webp` - 缩略图
- `/r2/shared/share-id/hash.jpg` - 分享文件

**响应**: 返回文件二进制数据

**响应头**
- `Content-Type`: 文件 MIME 类型
- `Cache-Control`: `public, max-age=31536000`
- `ETag`: 文件 ETag
- `Access-Control-Allow-Origin`: `*`

**错误码**
- `404`: 文件不存在

---

### 6.2 上传文件到 R2
上传图片文件到 R2 存储。

**请求**
- 方法: `POST`
- 路径: `/r2/upload`
- 认证: **需要**
- Content-Type: `image/*`

**请求头**
- `Content-Type`: 文件 MIME 类型（如 `image/jpeg`）
- `X-Content-Hash`: 文件内容哈希值（必填）
- `X-File-Name`: 文件名（可选）

**请求体**: 文件二进制数据

**响应**
```json
{
  "success": true,
  "data": {
    "r2_key": "user-id/assets/hash.jpg",
    "thumb_r2_key": "user-id/thumbs/hash_256.webp",
    "r2_url": "/r2/user-id/assets/hash.jpg"
  },
  "message": "上传成功"
}
```

**说明**
- 需要提前计算文件哈希值
- 自动根据用户 ID 和哈希值生成存储路径

---

## 7. 限流规则

### 请求限流
- **全局限流**: 100 请求/分钟/IP
- **API 限流**: 60 请求/分钟/用户

### 分享限流
- **创建分享**: 10 次/天/用户
- **查看分享**: 100 次/小时/IP

### 配额限制
- **资产数量**: 10,000 个/用户
- **存储空间**: 1 GB/用户
- **分享数量**: 100 个/用户

---

## 8. 错误码说明

| 状态码 | 说明 |
|-------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或认证失败 |
| 403 | 无权限或超出配额 |
| 404 | 资源不存在 |
| 410 | 资源已过期 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

---

## 9. 数据模型

### Asset (资产)
```typescript
{
  id: string                 // UUID
  user_id: string           // 所属用户
  content_hash: string      // 内容哈希
  file_name: string         // 文件名
  mime_type: string         // MIME 类型
  file_size: number         // 文件大小（字节）
  width: number             // 图片宽度
  height: number            // 图片高度
  r2_key: string            // R2 存储路径
  thumb_r2_key: string      // 缩略图路径
  is_favorite: number       // 是否收藏（0/1）
  favorited_at: number?     // 收藏时间
  use_count: number         // 使用次数
  last_used_at: number?     // 最后使用时间
  created_at: number        // 创建时间
  updated_at: number        // 更新时间
  deleted: number           // 是否删除（0/1）
  deleted_at: number?       // 删除时间
}
```

### Tag (标签)
```typescript
{
  id: string                 // UUID
  user_id: string           // 所属用户
  name: string              // 标签名
  color: string             // 标签颜色
  use_count: number         // 使用次数
  created_at: number        // 创建时间
  updated_at: number        // 更新时间
}
```

### Share (分享)
```typescript
{
  share_id: string          // 短 ID（8位）
  user_id: string           // 创建者
  title: string?            // 分享标题
  description: string?      // 分享描述
  expires_at: number?       // 过期时间
  max_downloads: number?    // 最大下载次数
  password_hash: string?    // 密码哈希
  view_count: number        // 查看次数
  download_count: number    // 下载次数
  created_at: number        // 创建时间
  updated_at: number        // 更新时间
}
```

---

## 10. 使用示例

### 设备注册登录
```bash
curl -X POST https://your-domain.workers.dev/auth/device-register \
  -H "Content-Type: application/json" \
  -d '{
    "device_name": "iPhone 14",
    "device_type": "mobile",
    "platform": "ios"
  }'
```

### 拉取云端数据
```bash
curl -X POST https://your-domain.workers.dev/sync/pull \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"since": 0}'
```

### 创建分享
```bash
curl -X POST https://your-domain.workers.dev/share/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "asset_ids": ["asset-id-1", "asset-id-2"],
    "title": "我的表情包",
    "expires_in": 86400
  }'
```

### 上传文件
```bash
curl -X POST https://your-domain.workers.dev/r2/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: image/jpeg" \
  -H "X-Content-Hash: sha256-hash-value" \
  -H "X-File-Name: meme.jpg" \
  --data-binary @meme.jpg
```

---

## 11. 注意事项

1. **认证 Token**
   - Token 有效期为 30 天
   - 过期后需要重新调用设备注册接口获取新 Token

2. **时间戳**
   - 所有时间戳使用毫秒级 Unix 时间戳
   - 同步时使用服务器返回的 `server_timestamp` 作为下次的 `since` 参数

3. **文件上传**
   - 需要先计算文件的 SHA-256 哈希值
   - 上传后再调用 `/sync/push` 同步元数据

4. **分享功能**
   - 分享的图片会复制到公共目录
   - 删除分享会同时删除复制的文件

5. **限流处理**
   - 遇到 429 错误时需要降低请求频率
   - 建议实现指数退避策略

---

## 12. 变更日志

### v1.0.0 (2024-10-16)
- 初始版本发布
- 实现基础认证、同步、分享功能
- 集成 R2 存储
- 添加配额管理
