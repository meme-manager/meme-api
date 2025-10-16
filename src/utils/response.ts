import type { ApiResponse } from '../types';

/**
 * 成功响应
 */
export function success<T>(data: T, message?: string): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
  };
  
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

/**
 * 错误响应
 */
export function error(message: string, status: number = 400): Response {
  const response: ApiResponse = {
    success: false,
    error: message,
  };
  
  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

/**
 * 未授权响应
 */
export function unauthorized(message: string = '未授权'): Response {
  return error(message, 401);
}

/**
 * 禁止访问响应
 */
export function forbidden(message: string = '禁止访问'): Response {
  return error(message, 403);
}

/**
 * 未找到响应
 */
export function notFound(message: string = '未找到'): Response {
  return error(message, 404);
}

/**
 * 限流响应
 */
export function tooManyRequests(message: string = '请求过于频繁'): Response {
  return error(message, 429);
}

/**
 * 服务器错误响应
 */
export function serverError(message: string = '服务器错误'): Response {
  return error(message, 500);
}

/**
 * CORS 预检响应
 */
export function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
