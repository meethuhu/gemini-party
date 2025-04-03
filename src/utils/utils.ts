import type { Context, Next } from 'hono';
const AUTH_TOKEN = process.env.AUTH_TOKEN;

/**
 * 验证API密钥是否有效
 * @param {string | undefined} apiKey - 需要验证的API密钥
 * @returns {boolean} 密钥是否有效
 */
function isValidApiKey(apiKey: string | undefined): boolean {
    if (!apiKey || !AUTH_TOKEN) {
        return false;
    }

    // 处理Bearer令牌格式
    const token = apiKey.startsWith('Bearer ')
        ? apiKey.split(' ')[1]
        : apiKey;

    return token === AUTH_TOKEN;
}

/**
 * 创建Gemini认证中间件
 * @returns {Function} Hono中间件函数
 */
function createGeminiAuthMiddleware() {
    return async function (c: Context, next: Next) {
        // 从请求头或查询参数中获取API密钥
        const apiKey = c.req.header('x-goog-api-key') || c.req.query('key');
        if (!isValidApiKey(apiKey)) {
            return c.json({ error: 'Invalid API key' }, 401);
        }
        await next();
    }
}

/**
 * 创建OpenAI认证中间件
 * @returns {Function} Hono中间件函数
 */
function createOpenAIAuthMiddleware() {
    return async function (c: Context, next: Next) {
        // 从认证请求头中获取API密钥
        const authHeader = c.req.header('authorization');
        if (!isValidApiKey(authHeader)) {
            return c.json({ error: 'Invalid API key' }, 401);
        }
        await next();
    }
}

/**
 * 创建标准化的错误响应
 * @param {any} error - 错误对象
 * @returns {Object} 包含状态码和错误消息的对象
 */
export function createErrorResponse(error: any) {
    const status = error.status || 500;
    const message = error.error?.message || error.message || 'Unknown error';
    const type = error.error?.type || error.type || "invalid_request_error";
    return { status, body: { error: { message, type } } };
}

// --- API密钥管理 ---
if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
}
const geminiAPIKeys = process.env.GEMINI_API_KEY.split(",");
let apiKeyRotationIndex = 0;

/**
 * 获取API密钥
 * 通过轮询方式从预设的密钥列表中获取一个密钥
 * @returns {string} Gemini API密钥
 */
export function getAPIKey() {
    apiKeyRotationIndex = apiKeyRotationIndex % geminiAPIKeys.length;
    const key = geminiAPIKeys[apiKeyRotationIndex];
    apiKeyRotationIndex++;

    return key;
}


export const geminiAuthMiddleware = createGeminiAuthMiddleware();
export const openaiAuthMiddleware = createOpenAIAuthMiddleware();