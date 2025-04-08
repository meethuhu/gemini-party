import { GoogleGenAI } from '@google/genai';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import OpenAI from 'openai';

import { getApiKey } from '../utils/apikey';
import { createHonoErrorResponse, createErrorResponse } from '../utils/error';
import { geminiAuthMiddleware, openaiAuthMiddleware } from '../utils/middleware';
import normalizeRequestBody from '../utils/rebody';

const genai = new Hono();

genai.use('/models/*', geminiAuthMiddleware);
genai.use('/openai/embeddings', openaiAuthMiddleware);

// 定义基本类型
type HandlerFunction = (c: Context, model: string, apiKey: string, body: any) => Promise<Response>;

// 操作处理器映射
const actionHandlers: Record<string, HandlerFunction> = {
    generateContent: handleGenerateContent, // 非流式内容处理
    streamGenerateContent: handleGenerateContentStream, // 流式内容处理
    embedContent: handleEmbedContent, // 文本嵌入向量
};

// 非流式内容处理
async function handleGenerateContent(c: Context, model: string, apiKey: string, originalBody: any): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const body = normalizeRequestBody(originalBody, model);

    try {
        const response = await ai.models.generateContent({
            ...body,
        });

        return c.json(response);
    } catch (error) {
        console.error('Generate content error:', error);
        return createHonoErrorResponse(c, error);
    }
}

// 流式内容处理
async function handleGenerateContentStream(c: Context, model: string, // 添加model参数
    apiKey: string, originalBody: any): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const isGoogleClient = c.req.header('x-goog-api-client')?.includes('genai-js') || false;
    const body = normalizeRequestBody(originalBody, model); // 传入model参数
    try {
        const result = await ai.models.generateContentStream({
            ...body,
        });
        // Hono 流式响应
        return streamSSE(c, async (stream) => {
            try {
                for await (const chunk of result) {
                    stream.writeSSE({
                        data: JSON.stringify(chunk),
                    });
                }
                // Google 客户端不希望收到 [DONE] 消息
                if (!isGoogleClient) {
                    stream.writeSSE({ data: '[DONE]' });
                }
            } catch (e) {
                console.error('Streaming error:', e);
                const { body } = createErrorResponse(e);
                stream.writeSSE({
                    data: JSON.stringify(body),
                });
            }
        });
    } catch (error) {
        console.error('Generate content stream error:', error);
        return createHonoErrorResponse(c, error);
    }
}

// Embeddings
async function handleEmbedContent(c: Context, model: string, apiKey: string, body: any): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const contents = body.contents;

    try {
        const response = await ai.models.embedContent({
            model, contents, config: {
                taskType: body.task_type, title: body.title, outputDimensionality: body.outputDimensionality,
            },
        });
        return c.json({
            embedding: response?.embeddings?.[0] || { values: [] },
        });
    } catch (error) {
        console.error('Embed content error:', error);
        return createHonoErrorResponse(c, error);
    }
}

// 内容生成路由
genai.post('/models/:modelAction{.+:.+}', async (c: Context) => {
    const modelAction = c.req.param('modelAction');
    const [model, action] = modelAction.split(':');

    // 验证模型和操作是否存在
    if (!model || !action) {
        return createHonoErrorResponse(c, {
            message: '无效的请求路径格式，预期格式: /v1beta/models/{model}:{action}',
            type: 'invalid_request_error',
            status: 400,
        });
    }

    // 获取对应的处理函数
    const handler = actionHandlers[action];

    if (!handler) {
        return createHonoErrorResponse(c, {
            message: `不支持的操作: ${action}`, // 使用反引号来创建模板字符串
            type: 'invalid_request_error', status: 400,
        });
    }

    const body = await c.req.json();
    const apiKey = getApiKey(model);
    return handler(c, model, apiKey, body);
});

// 获取所有模型
genai.get('/models', async (c: Context) => {
    const API_KEY = getApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const response = await fetch(url);
    const data = (await response.json()) as Record<string, any>;
    return c.json(data);
});

// 检索模型
genai.get('/models/:model', async (c: Context) => {
    const model = c.req.param('model');
    const API_KEY = getApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = (await response.json()) as Record<string, any>;
    return c.json(data);
});

// OpenAI 格式的 Embeddings
genai.post('/openai/embeddings', async (c) => {
    const body = await c.req.json();
    const { model, input, encoding_format, dimensions } = body;

    if (!model || !input) {
        return createHonoErrorResponse(c, {
            message: "请求体必须包含 'model' 和 'input' 参数。", type: 'invalid_request_error', status: 400,
        });
    }

    const openai = new OpenAI({
        apiKey: getApiKey(model), baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });

    try {
        const embeddingResponse = await openai.embeddings.create({
            model: model,
            input: input, ...(encoding_format && { encoding_format: encoding_format }), ...(dimensions && { dimensions: dimensions }),
        });

        return c.json(embeddingResponse);
    } catch (error: any) {
        console.error('创建 Embeddings 时出错:', error);
        return createHonoErrorResponse(c, error);
    }
});

export default genai;
