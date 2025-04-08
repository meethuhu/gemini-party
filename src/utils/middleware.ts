import type {Context, Next} from 'hono';

const AUTH_TOKEN = process.env.AUTH_TOKEN;

/**
 * Gemini认证中间件
 */
function createGeminiAuthMiddleware() {
    return async function (c: Context, next: Next) {
        const reqToken = c.req.header('x-goog-api-key') || c.req.query('key');
        if (!AUTH_TOKEN) {
            return c.json({error: 'AUTH_TOKEN not set correctly'}, 401);
        }

        if (AUTH_TOKEN !== reqToken) {
            return c.json({error: 'Invalid API key'}, 401);
        }
        await next();
    }
}

/**
 * OpenAI认证中间件
 */
function createOpenAIAuthMiddleware() {
    return async function (c: Context, next: Next) {
        const token = c.req.header('authorization') || '';
        const reqToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

        if (!AUTH_TOKEN) {
            return c.json({error: 'AUTH_TOKEN not set correctly'}, 401);
        }

        if (AUTH_TOKEN !== reqToken) {
            return c.json({error: 'Invalid API key'}, 401);
        }
        await next();
    }
}

export const geminiAuthMiddleware = createGeminiAuthMiddleware();
export const openaiAuthMiddleware = createOpenAIAuthMiddleware();