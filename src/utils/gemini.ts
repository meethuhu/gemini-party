import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { GoogleGenAI } from "@google/genai";
import { getAPIKey, geminiAuthMiddleware, createErrorResponse } from './utils';
import type { Context } from 'hono';

const genai = new Hono();

genai.use('/*', geminiAuthMiddleware);

// 定义基本类型
type RequestContext = Context;
type HandlerFunction = (c: RequestContext, model: string) => Promise<Response>;

// 操作处理器映射
const actionHandlers: Record<string, HandlerFunction> = {
    generateContent: handleGenerateContent,             // 非流式内容处理
    generateContentStream: handleGenerateContentStream, // 流式内容处理
    streamGenerateContent: handleGenerateContentStream, // 流式内容处理
    countTokens: handleCountTokens,                     // 计算 token 数量
    embedContent: handleEmbedContent,                   // 文本嵌入向量
};

// 转换请求体格式为 GenAI 接受的格式
function convertRequestFormat(model: string = '', body: any) {
    const newBody = { ...body };
    // 系统指令处理
    if (newBody.systemInstruction) {
        newBody.config = newBody.config || {};
        newBody.config.systemInstruction = newBody.systemInstruction;
        delete newBody.systemInstruction;
    }
    // 安全设置处理
    if (newBody.safetySettings) {
        newBody.config = newBody.config || {};
        newBody.config.safetySettings = newBody.safetySettings;
        delete newBody.safetySettings;
    }
    // 工具处理
    if (newBody.tools) {
        newBody.config = newBody.config || {};
        newBody.config.tools = newBody.tools;
        delete newBody.tools;
    }
    // 配置参数处理
    if (newBody.generationConfig) {
        newBody.config = newBody.config || {};
        newBody.config = { ...newBody.config, ...newBody.generationConfig };
        delete newBody.generationConfig;
    }
    return newBody;
}

// 文本嵌入向量
async function handleEmbedContent(c: RequestContext, model: string): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: getAPIKey() });
    const body = await c.req.json();

    const contents = body.content.parts.map((part: any) => part.text);

    try {
        const response = await ai.models.embedContent({
            model,
            contents,
            config: { ...body }
        });

        return c.json({
            embedding: response?.embeddings?.[0] || { values: [] }
        });
    } catch (error) {
        console.error('Embed content error:', error);
        return c.json(createErrorResponse(error), 500);
    }
}

async function handleCountTokens(c: RequestContext, model: string): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: getAPIKey() });
    const originalBody = await c.req.json();
    // 处理 Generative AI 格式
    const body = convertRequestFormat(model, originalBody);

    try {
        const response = await ai.models.countTokens({
            model,
            ...body,
        });

        // 直接返回 API 的响应，包含 totalTokens 信息
        return c.json(response);
    } catch (error) {
        console.error('Count tokens error:', error);
        return c.json(createErrorResponse(error), 500);
    }
}

// 非流式内容处理
async function handleGenerateContent(c: RequestContext, model: string,): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: getAPIKey() });
    const originalBody = await c.req.json();

    console.log(JSON.stringify(originalBody));
    // 处理 Generative AI 格式
    const body = convertRequestFormat(model, originalBody);

    console.log(JSON.stringify(body));

    try {
        const response = await ai.models.generateContent({
            model,
            ...body,
        });

        return c.json(response);
    } catch (error) {
        console.error('Generate content error:', error);
        return c.json(createErrorResponse(error), 500);
    }
}

// 流式内容处理
async function handleGenerateContentStream(c: RequestContext, model: string): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: getAPIKey() });
    const originalBody = await c.req.json();
    const isGoogleClient = c.req.header('x-goog-api-client')?.includes('genai-js') || false;
    // 处理 Generative AI 格式
    const body = convertRequestFormat(model, originalBody);

    try {
        // 使用generateContentStream API
        const result = await ai.models.generateContentStream({
            model,
            ...body
        });

        // Hono 流式响应
        return streamSSE(c, async (stream) => {
            try {
                for await (const chunk of result) {
                    stream.writeSSE({
                        data: JSON.stringify(chunk)
                    });
                }
                // Google 客户端不希望收到 [DONE] 消息
                if (!isGoogleClient) stream.writeSSE({ data: '[DONE]' });
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

// 内容生成路由
genai.post('/models/:modelAction', async (c: RequestContext) => {
    const modelAction = c.req.param('modelAction');
    const model: string = modelAction.split(':')[0] || '';
    const action: string = modelAction.split(':')[1] || '';

    if (!model || !action) {
        return c.json({ error: 'Invalid path format. Expected format: /v1beta/models/{model}:{generateContent}' }, 400);
    }

    const handler = actionHandlers[action];

    if (!handler) {
        return c.json({ error: 'Invalid path format. Expected format: /v1beta/models/model:{generateContent}' }, 400);
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
