import {APIError} from 'openai';
import type {Context} from 'hono';
import type {ContentfulStatusCode} from 'hono/utils/http-status';

// 错误类型定义
export enum ErrorType {
    INVALID_REQUEST = 'invalid_request_error',
    AUTHENTICATION = 'authentication_error',
    RATE_LIMIT = 'rate_limit_error',
    SERVER = 'server_error',
    UNKNOWN = 'unknown_error'
}

// 标准错误响应接口
export interface StandardError {
    message: string;
    type: ErrorType;
    code?: string;
    param?: string;
}

// 错误响应接口
export interface ErrorResponse {
    status: ContentfulStatusCode;
    body: {
        error: StandardError;
    };
}

// 常见错误消息
const ERROR_MESSAGES = {
    [ErrorType.INVALID_REQUEST]: '无效的请求',
    [ErrorType.AUTHENTICATION]: '认证失败',
    [ErrorType.RATE_LIMIT]: '请求频率超限',
    [ErrorType.SERVER]: '服务器内部错误',
    [ErrorType.UNKNOWN]: '未知错误'
} as const;

// 错误对象接口
interface ErrorObject {
    message?: unknown;
    error?: {
        message?: unknown;
    };
    type?: unknown;
    code?: unknown;
    param?: unknown;
}

/**
 * 从错误对象中提取错误信息
 */
function extractErrorInfo(error: unknown): StandardError {
    if (error instanceof APIError) {
        return {
            message: error.message,
            type: error.type as ErrorType || ErrorType.UNKNOWN,
            code: error.code || undefined,
            param: error.param || undefined
        };
    }

    if (error instanceof Error) {
        return {
            message: error.message, type: ErrorType.UNKNOWN, code: 'error'
        };
    }

    if (typeof error === 'object' && error !== null) {
        const err = error as ErrorObject;
        const message = err.message || err.error?.message || ERROR_MESSAGES[ErrorType.UNKNOWN];
        return {
            message: String(message),
            type: err.type as ErrorType || ErrorType.UNKNOWN,
            code: err.code as string,
            param: err.param as string
        };
    }

    return {
        message: ERROR_MESSAGES[ErrorType.UNKNOWN], type: ErrorType.UNKNOWN
    };
}

/**
 * 获取错误对应的HTTP状态码
 */
function getErrorStatus(error: unknown): ContentfulStatusCode {
    if (error instanceof APIError) {
        return (error.status || 500) as ContentfulStatusCode;
    }

    if (typeof error === 'object' && error !== null) {
        const err = error as { status?: number };
        if (typeof err.status === 'number') {
            return err.status as ContentfulStatusCode;
        }
    }
    return 500 as ContentfulStatusCode;
}

/**
 * 创建标准化的错误响应
 *
 * @param error 错误对象
 * @returns 标准化的错误响应
 */
export function createErrorResponse(error: unknown): ErrorResponse {
    const status = getErrorStatus(error);
    const errorInfo = extractErrorInfo(error);

    return {
        status, body: {
            error: errorInfo
        }
    };
}

/**
 * 创建 Hono 兼容的错误响应
 *
 * @param c Hono 上下文
 * @param error 错误对象
 * @returns Hono 响应
 */
export function createHonoErrorResponse(c: Context, error: unknown) {
    const {status, body} = createErrorResponse(error);
    return c.json(body, status);
}