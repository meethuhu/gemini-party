const AUTH_TOKEN = process.env.AUTH_TOKEN;
import type { Context, Next } from 'hono';

/**
 * 验证API密钥是否有效
 */
function isValidApiKey(apiKey: string | undefined): boolean {
    if (!apiKey || !AUTH_TOKEN) {
        return false;
    }

    const token = apiKey.startsWith('Bearer ')
        ? apiKey.split(' ')[1]
        : apiKey;

    return token === AUTH_TOKEN;
}

/**
 * 创建Gemini认证中间件
 */
function createGeminiAuthMiddleware() {
    return async function (c: Context, next: Next) {
        const apiKey = c.req.header('x-goog-api-key') || c.req.query('key');
        if (!isValidApiKey(apiKey)) {
            return c.json({ error: 'Invalid API key' }, 401);
        }
        await next();
    }
}

/**
 * 创建OpenAI认证中间件
 */
function createOpenAIAuthMiddleware() {
    return async function (c: Context, next: Next) {
        const authHeader = c.req.header('authorization');
        if (!isValidApiKey(authHeader)) {
            return c.json({ error: 'Invalid API key' }, 401);
        }
        await next();
    }
}

// 导出预配置的中间件实例
export const geminiAuthMiddleware = createGeminiAuthMiddleware();
export const openaiAuthMiddleware = createOpenAIAuthMiddleware();