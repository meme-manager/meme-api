-- 全局配置表
CREATE TABLE server_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    description TEXT
);

-- 初始化配置
INSERT INTO server_config (key, value, updated_at, description) VALUES
    ('sync_password_hash', '', 0, '同步密码哈希（SHA-256），为空则无需密码'),
    ('admin_password_hash', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 0, '管理密码哈希（SHA-256），默认: admin'),
    ('require_sync_password', 'false', 0, '是否需要同步密码'),
    ('server_name', 'Meme Manager', 0, '服务器名称');

-- 设备表（无 user_id）
CREATE TABLE devices (
    device_id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    device_type TEXT NOT NULL,
    platform TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

-- 资产表（无 user_id）
CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    
    -- R2 存储路径（只存原图，缩略图由客户端生成）
    r2_key TEXT NOT NULL,
    
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
    
    -- 创建设备（记录但不限制访问）
    created_by_device TEXT,
    FOREIGN KEY (created_by_device) REFERENCES devices(device_id) ON DELETE SET NULL
);

-- 标签表（无 user_id）
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    use_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(name)
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

-- 全局设置表
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    description TEXT
);

-- 初始化默认设置
INSERT INTO settings (key, value, updated_at, description) VALUES
    ('auto_play_gif', 'true', 0, '自动播放 GIF'),
    ('theme', 'light', 0, '主题：light/dark'),
    ('grid_size', 'medium', 0, '网格大小：small/medium/large');

-- 分享表（无 user_id）
CREATE TABLE shares (
    share_id TEXT PRIMARY KEY,
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
    
    -- 创建设备
    created_by_device TEXT,
    FOREIGN KEY (created_by_device) REFERENCES devices(device_id) ON DELETE SET NULL
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
CREATE INDEX idx_assets_created_at ON assets(created_at DESC);
CREATE INDEX idx_assets_updated_at ON assets(updated_at DESC);
CREATE INDEX idx_assets_hash ON assets(content_hash);
CREATE INDEX idx_assets_deleted ON assets(deleted) WHERE deleted = 0;
CREATE INDEX idx_assets_favorite ON assets(is_favorite) WHERE is_favorite = 1;

CREATE INDEX idx_asset_tags_asset ON asset_tags(asset_id);
CREATE INDEX idx_asset_tags_tag ON asset_tags(tag_id);

CREATE INDEX idx_shares_expires ON shares(expires_at);

CREATE INDEX idx_share_assets_share ON share_assets(share_id, display_order);

CREATE INDEX idx_devices_last_seen ON devices(last_seen_at DESC);
