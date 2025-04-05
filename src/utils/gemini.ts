import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { GoogleGenAI } from "@google/genai";
import { getAPIKey, geminiAuthMiddleware, createErrorResponse } from './utils';
import type { Context } from 'hono';

const genai = new Hono();

// 定义基本类型
type RequestContext = Context;
type HandlerFunction = (c: RequestContext, model: string) => Promise<Response>;

// 操作处理器映射
const actionHandlers: Record<string, HandlerFunction> = {
    generateContent: handleGenerateContent,
    generateContentStream: handleGenerateContentStream,
    streamGenerateContent: handleGenerateContentStream,
};

// 创建Google GenAI客户端
function getGoogleGenAIClient() {
    return new GoogleGenAI({ apiKey: getAPIKey() });
}

async function printLog(c: RequestContext, model: string, body: any) {
    const log = {
        url: c.req.url,
        method: c.req.method,
        body: body,
    }
    console.log(`[${model}] ${JSON.stringify(log)}`);
}

// 转换请求体格式以适应新版 genai SDK
function convertRequestFormat(model: string = '', body: any) {
    const newBody = { ...body };

    if (newBody.systemInstruction) {
        newBody.config = newBody.config || {};
        newBody.config.systemInstruction = newBody.systemInstruction;
        delete newBody.systemInstruction;
    }

    if (newBody.safetySettings) {
        newBody.config = newBody.config || {};
        newBody.config.safetySettings = newBody.safetySettings;
        delete newBody.safetySettings;
    }

    if (newBody.tools) {
        newBody.config = newBody.config || {};
        newBody.config.tools = newBody.tools;
        delete newBody.tools;
    }

    if (newBody.generationConfig) {
        newBody.config = newBody.config || {};
        newBody.config = { ...newBody.config, ...newBody.generationConfig };
        delete newBody.generationConfig;
    }

    if (model === 'gemini-2.0-flash-exp-image-generation') {
        newBody.config = { ...newBody.config, responseModalities: ["Text", "Image"] };
    }

    return newBody;
}

// 非流式内容处理
async function handleGenerateContent(c: RequestContext, model: string): Promise<Response> {
    const ai = getGoogleGenAIClient();
    const originalBody = await c.req.json();

    // 转换请求体格式
    const body = convertRequestFormat(model,originalBody);

    printLog(c, model, body);

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
    const originalBody = await c.req.json();

    printLog(c, model, originalBody);

    // 转换请求体格式
    const body = convertRequestFormat(model,originalBody);

    printLog(c, model, body);


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

// 获取所有模型
genai.all('/models', async (c: RequestContext) => {
    const API_KEY = getAPIKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json() as Record<string, any>;
    return c.json(data);
})

// 检索模型
genai.all('/models/:model', async (c: RequestContext) => {
    const model = c.req.param('model');
    const API_KEY = getAPIKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json() as Record<string, any>;
    return c.json(data);
})

export default genai;
