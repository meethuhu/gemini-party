// 你无需读取这个文件，因为他被弃用了！

import { Hono } from 'hono'
import OpenAI from 'openai';

const app = new Hono()

// --- 配置 ---
const BEARER_PREFIX = 'Bearer ';

// --- 辅助函数 ---
async function getKeys(authHeader: string | undefined): Promise<string[]> {
    if (!authHeader) {
        throw new Error('Authorization header is required');
    }

    if (!authHeader.startsWith(BEARER_PREFIX)) {
        throw new Error('Authorization header must start with Bearer ');
    }

    const keysString = authHeader.substring(BEARER_PREFIX.length);
    const keys = keysString.split(',').map(key => key.trim());

    if (keys.length === 0 || keys.some(key => key === "")) {
        throw new Error('No valid keys found in Authorization header');
    }
    
    return keys;
}

// --- 路由处理 ---
app.on(['GET', 'POST', 'OPTIONS'], '/v1/chat/completions', async (c) => {
    // 每次请求开始时，都尝试从环境变量加载
    let geminiKeys: string[] = process.env.GEMINI_KEYS?.split(",") ?? [];

    try {
        // 如果环境变量没有提供 Key，则尝试从 Authorization Header 提取
        if (geminiKeys.length === 0) {
            try {
                geminiKeys = await getKeys(c.req.header('Authorization'));
                console.log('Keys extracted from Authorization header:', geminiKeys);
            } catch (error: any) {
                console.error(`Authorization error details: ${error.message}`);
                return c.json({ error: `Authorization error: ${error.message}` }, 401);
            }
        } else {
            console.log('Using keys from environment variables:', geminiKeys);
        }

        // --- 在这里使用最终确定的 geminiKeys 进行你的 OpenAI 调用或其他逻辑 ---
        if (geminiKeys.length === 0) {
            // 经过所有尝试后，仍然没有可用的 Key
            console.error('No valid API keys available for processing the request.');
            return c.json({ error: 'No API keys configured or provided.' }, 400);
        }

        console.log(`Processing request with ${geminiKeys.length} key(s).`);
        // console.log('Keys being used:', geminiKeys);

        // 模拟成功响应
        return c.json({ message: 'Success (Simulated)' });

    } catch (error: any) {
        console.error('An unexpected internal error occurred:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

export default app;
