// Cloudflare Workers 绑定类型
export interface CloudflareBindings {
  DB: D1Database;
  R2: R2Bucket;
  KV?: KVNamespace;  // 可选,用于限流
  ENVIRONMENT: string;
  JWT_SECRET?: string;
  [key: string]: any; // 索引签名以兼容 Hono Bindings
}

// Hono 上下文变量类型
export interface HonoVariables {
  user?: JWTPayload;
  [key: string]: any; // 索引签名以兼容 Hono Variables
}

// Hono 环境类型
export type AppEnv = {
  Bindings: CloudflareBindings;
  Variables: HonoVariables;
};

// 用户类型
export interface User {
  user_id: string;
  created_at: number;
  last_login_at: number;
  storage_used: number;
}

// 设备类型
export interface Device {
  device_id: string;
  user_id: string;
  device_name: string;
  device_type: string;
  platform: string;
  last_seen_at: number;
}

// 资产类型
export interface Asset {
  id: string;
  user_id: string;
  content_hash: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  r2_key: string;
  thumb_r2_key: string;
  is_favorite: number;
  favorited_at: number | null;
  use_count: number;
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
  deleted: number;
  deleted_at: number | null;
}

// 标签类型
export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  use_count: number;
  created_at: number;
  updated_at: number;
}

// 资产-标签关联
export interface AssetTag {
  asset_id: string;
  tag_id: string;
  created_at: number;
}

// 用户设置
export interface UserSetting {
  user_id: string;
  key: string;
  value: string;
  updated_at: number;
}

// 分享类型
export interface Share {
  share_id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  expires_at: number | null;
  max_downloads: number | null;
  password_hash: string | null;
  view_count: number;
  download_count: number;
  created_at: number;
  updated_at: number;
}

// 分享资产
export interface ShareAsset {
  share_id: string;
  asset_id: string;
  display_order: number;
}

// JWT Payload
export interface JWTPayload {
  user_id: string;
  device_id: string;
  exp: number;
}

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 同步请求/响应
export interface SyncPullRequest {
  since: number;
}

export interface SyncPullResponse {
  assets: Asset[];
  tags: Tag[];
  asset_tags: AssetTag[];
  settings: UserSetting[];
  server_timestamp: number;
  total_count: number;
}

export interface SyncPushRequest {
  assets: Asset[];
  tags: Tag[];
  asset_tags: AssetTag[];
  settings: UserSetting[];
}

export interface SyncPushResponse {
  success: boolean;
  synced_count: number;
  server_timestamp: number;
}

// 分享请求/响应
export interface CreateShareRequest {
  asset_ids: string[];
  title?: string;
  description?: string;
  expires_in?: number;
  max_downloads?: number;
  password?: string;
}

export interface CreateShareResponse {
  share_id: string;
  share_url: string;
  expires_at?: number;
}

export interface GetShareResponse {
  title: string | null;
  description: string | null;
  assets: Array<{
    id: string;
    file_name: string;
    mime_type: string;
    width: number;
    height: number;
    thumb_url: string;
    download_url: string;
  }>;
  expires_at: number | null;
  view_count: number;
}

// 配额信息
export interface QuotaInfo {
  assets: {
    used: number;
    limit: number;
    percentage: number;
  };
  storage: {
    used: number;
    limit: number;
    percentage: number;
  };
  shares: {
    used: number;
    limit: number;
    percentage: number;
  };
}

// 限流配置
export interface RateLimitConfig {
  maxAssetsPerUser: number;
  maxStoragePerUser: number;
  maxSharesPerUser: number;
  maxSharesPerDay: number;
  maxRequestsPerIpPerHour: number;
  maxShareViewsPerIpPerHour: number;
  maxViewsPerShare: number;
  maxDownloadsPerShare: number;
}
