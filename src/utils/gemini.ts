import type { GenerateContentParameters } from '@google/genai';
import { Hono } from 'hono';
import { GoogleGenAI } from "@google/genai";
import getGeminiAPIKey from './getGeminiAPIKey';
import createErrorResponse from './error';
import checkAuth from './auth';
import { logger } from 'hono/logger';

const genai = new Hono();

// Gemini客户端工厂函数
function getGeminiClient(): GoogleGenAI {
    return new GoogleGenAI({ apiKey: getGeminiAPIKey() });
}

// 打印请求信息
function printLog(c: any) {
    console.log(c.req.json());
    console.log(c.req.header());
    console.log(c.req.query());
    console.log(c.req.param());
}

genai.post('/models/:fullPath', async (c) => {
    const fullPath = c.req.param('fullPath');
    const [modelName, contentType] = fullPath.split(':');
    const apiKey = c.req.header('x-goog-api-key') || c.req.query('key');
    if (!checkAuth(apiKey)) return c.json({ error: 'Invalid API key' }, 401);

    // printLog(c);

    try {
        const ai = getGeminiClient();
        const body = await c.req.json();
        if (!modelName || !contentType) {
            return c.json({ error: 'Invalid path format' }, 400);
        }
        // 生成内容
        if (contentType === 'generateContent') {
            // 传递所有参数而非仅contents
            const response = await ai.models.generateContent({
                model: modelName,
                ...body  // 展开所有请求参数
            });
            return c.json(response);
        }
        // 流式生成内容
        if (contentType === 'streamGenerateContent') {
            const result = await ai.models.generateContentStream({
                model: modelName,
                ...body  // 展开所有请求参数
            });

            // 使用Response对象作为流式响应
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const chunk of result) {
                            // 将每个块转换为SSE格式
                            const data = JSON.stringify(chunk);
                            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                        }
                        // 关闭流，不发送[DONE]标记
                        controller.close();
                    } catch (e) {
                        controller.error(e);
                    }
                }
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                }
            });
        }

        return c.json({ error: `Unsupported content type: ${contentType}` }, 400);

    } catch (error: any) {
        console.error('API调用错误:', error);
        const { status, body } = createErrorResponse(error);
        return c.json(body, status);
    }
});

export default genai;