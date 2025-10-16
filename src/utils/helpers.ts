/**
 * 生成短 ID（用于分享链接）
 */
export function generateShortId(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  
  return result;
}

/**
 * 生成 UUID
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * 哈希密码
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 验证密码
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

/**
 * 获取当前时间戳（毫秒）
 */
export function now(): number {
  return Date.now();
}

/**
 * 格式化文件大小
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * 安全的 JSON 解析
 */
export async function safeJsonParse<T>(request: Request): Promise<T | null> {
  try {
    return await request.json();
  } catch (error) {
    console.error('[Helper] JSON 解析失败:', error);
    return null;
  }
}

/**
 * 验证必填字段
 */
export function validateRequired(data: any, fields: string[]): { valid: boolean; missing?: string[] } {
  const missing = fields.filter(field => !data[field]);
  
  if (missing.length > 0) {
    return { valid: false, missing };
  }
  
  return { valid: true };
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * 生成 R2 存储路径
 */
export function generateR2Key(userId: string, type: 'asset' | 'thumb' | 'shared', hash: string, ext: string): string {
  if (type === 'shared') {
    return `shared/${hash}.${ext}`;
  }
  return `${userId}/${type === 'asset' ? 'assets' : 'thumbs'}/${hash}.${ext}`;
}

/**
 * 延迟执行
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
