-- 用户表
CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER,
    storage_used INTEGER DEFAULT 0
);

-- 设备表
CREATE TABLE devices (
    device_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    device_type TEXT NOT NULL,
    platform TEXT,
    last_seen_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 资产表
CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    
    -- R2 存储路径
    r2_key TEXT NOT NULL,
    thumb_r2_key TEXT,
    
    -- 元数据
    is_favorite INTEGER DEFAULT 0,
    favorited_at INTEGER,
    use_count INTEGER DEFAULT 0,
    last_used_at INTEGER,
    
    -- 时间戳
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    -- 软删除
    deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 标签表
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    use_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
);

-- 资产-标签关联表
CREATE TABLE asset_tags (
    asset_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (asset_id, tag_id),
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- 用户设置表
CREATE TABLE user_settings (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 分享表
CREATE TABLE shares (
    share_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    description TEXT,
    
    -- 访问控制
    expires_at INTEGER,
    max_downloads INTEGER,
    password_hash TEXT,
    
    -- 统计
    view_count INTEGER DEFAULT 0,
    download_count INTEGER DEFAULT 0,
    
    -- 时间戳
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 分享资产表
CREATE TABLE share_assets (
    share_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    PRIMARY KEY (share_id, asset_id),
    FOREIGN KEY (share_id) REFERENCES shares(share_id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_assets_user_updated ON assets(user_id, updated_at DESC);
CREATE INDEX idx_assets_hash ON assets(content_hash);
CREATE INDEX idx_assets_deleted ON assets(deleted) WHERE deleted = 0;
CREATE INDEX idx_assets_favorite ON assets(is_favorite) WHERE is_favorite = 1;

CREATE INDEX idx_tags_user ON tags(user_id);
CREATE INDEX idx_tags_name ON tags(user_id, name);

CREATE INDEX idx_asset_tags_asset ON asset_tags(asset_id);
CREATE INDEX idx_asset_tags_tag ON asset_tags(tag_id);

CREATE INDEX idx_shares_user ON shares(user_id);
CREATE INDEX idx_shares_expires ON shares(expires_at);

CREATE INDEX idx_share_assets_share ON share_assets(share_id, display_order);

CREATE INDEX idx_devices_user ON devices(user_id);
