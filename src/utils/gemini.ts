import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { GoogleGenAI } from "@google/genai";
import { getAPIKey, geminiAuthMiddleware, createErrorResponse } from './utils';
import type { Context } from 'hono';

const genai = new Hono();

// 定义基本类型
type RequestContext = Context;
type HandlerFunction = (c: RequestContext, model: string) => Promise<Response>;

// 创建Google GenAI客户端
function getGoogleGenAIClient() {
    return new GoogleGenAI({ apiKey: getAPIKey() });
}

// 非流式内容处理
async function handleGenerateContent(c: RequestContext, model: string): Promise<Response> {
    const ai = getGoogleGenAIClient();
    const body = await c.req.json();

    try {
        const response = await ai.models.generateContent({
            model,
            ...body,
        });
        return c.json({ response });
    } catch (error) {
        console.error('Generate content error:', error);
        return c.json(createErrorResponse(error), 500);
    }
}

// 流式内容处理
async function handleGenerateContentStream(c: RequestContext, model: string): Promise<Response> {
    const ai = getGoogleGenAIClient();
    const body = await c.req.json();
    const isGoogleClient = c.req.header('x-goog-api-client')?.includes('genai-js') || false;

    try {
        const result = await ai.models.generateContentStream({
            model,
            ...body,
        });

        return streamSSE(c, async (stream) => {
            try {
                for await (const chunk of result) {
                    stream.writeSSE({
                        data: JSON.stringify(chunk)
                    });
                }
                if (!isGoogleClient) {
                    stream.writeSSE({ data: '[DONE]' });
                }
            } catch (e) {
                console.error('Streaming error:', e);
                stream.writeSSE({
                    data: JSON.stringify({ error: createErrorResponse(e) })
                });
            }
        });
    } catch (error) {
        console.error('Generate content stream error:', error);
        return c.json(createErrorResponse(error), 500);
    }
}

// 操作处理器映射
const actionHandlers: Record<string, HandlerFunction> = {
    generateContent: handleGenerateContent,
    generateContentStream: handleGenerateContentStream,
    streamGenerateContent: handleGenerateContentStream,
};

// 应用认证中间件
genai.use('/*', geminiAuthMiddleware);

// 模型操作路由
genai.post('/models/:modelAction', async (c: RequestContext) => {
    const modelAction = c.req.param('modelAction');

    const [model, action] = modelAction.split(':');
    if (!model || !action) {
        return c.json({ error: 'Invalid path format. Expected format: /v1beta/models/{model}:{contentType}' }, 400);
    }

    const handler = actionHandlers[action];

    if (!handler) {
        return c.json({ error: 'Unsupported action' }, 400);
    }

    return handler(c, model);
});

export default genai;