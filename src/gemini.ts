import OpenAI from 'openai';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { GoogleGenAI } from "@google/genai";
import type { Context } from 'hono';

import createErrorResponse from './utils/error';
import { getApiKey } from './utils/apikey';
import { openaiAuthMiddleware, geminiAuthMiddleware } from './utils/middleware';
import { getValidHarmSettings } from './utils/safety';

const genai = new Hono();

genai.use('/model/*', geminiAuthMiddleware);
genai.use('/openai/embeddings', openaiAuthMiddleware);

// 定义基本类型
type HandlerFunction = (c: Context, model: string, apiKey: string, body: any) => Promise<Response>;

// 操作处理器映射
const actionHandlers: Record<string, HandlerFunction> = {
    generateContent: handleGenerateContent,             // 非流式内容处理
    streamGenerateContent: handleGenerateContentStream, // 流式内容处理
    embedContent: handleEmbedContent,                   // 文本嵌入向量
};

/**
 * 将收到的请求转换为 js-genai 可以接受的格式
 * 
 * @param model - 模型名称 (可选)
 * @param body - 原始请求体
 * @returns 格式化后的请求体
 */
function convertRequestFormat(body: any) {
    // 检查 body 时候符合要求
    if (!body || typeof body !== 'object') { return body; }

    const formattedRequest = { ...body };
    formattedRequest.config = formattedRequest.config || {};

    // 这些字段需要从顶层移动到 config 对象中
    const configFields = [
        'systemInstruction',  // 系统指令
        'safetySettings',     // 安全设置
        'tools',              // 函数工具
        'responseModalities'  // 响应类型 (文本/图像)
    ];

    // 将指定字段从顶层移动到 config 对象中
    configFields.forEach(fieldName => {
        if (fieldName in formattedRequest) {
            formattedRequest.config[fieldName] = formattedRequest[fieldName];
            delete formattedRequest[fieldName];
        }
    });

    // 将 generationConfig 中的所有属性合并到 config
    if (formattedRequest.generationConfig) {
        formattedRequest.config = {
            ...formattedRequest.config,
            ...formattedRequest.generationConfig
        };
        delete formattedRequest.generationConfig;
    }

    // 获取有效的安全设置（优先使用环境变量，无环境变量时保留请求中的设置）
    const validHarmSettings = getValidHarmSettings(formattedRequest.config.safetySettings);

    // 如果有有效的安全设置，则使用它们
    if (validHarmSettings.length > 0) {
        formattedRequest.config.safetySettings = validHarmSettings;
    } else {
        // 如果没有有效的安全设置，则删除该属性避免发送空数组
        delete formattedRequest.config.safetySettings;
    }

    return formattedRequest;
}

// 非流式内容处理
async function handleGenerateContent(c: Context, model: string, apiKey: string, originalBody: any): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const body = convertRequestFormat(originalBody);

    try {
        const response = await ai.models.generateContent({
            model,
            ...body,
        });

        return c.json(response);
    } catch (error) {
        console.error('Generate content error:', error);
        const { status, body: errorBody } = createErrorResponse(error);
        return c.json(errorBody, status);
    }
}

// 流式内容处理
async function handleGenerateContentStream(c: Context, model: string, apiKey: string, originalBody: any): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const isGoogleClient = c.req.header('x-goog-api-client')?.includes('genai-js') || false;
    const body = convertRequestFormat(originalBody);
    try {
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
                if (!isGoogleClient) {
                    stream.writeSSE({ data: '[DONE]' });
                }
            } catch (e) {
                console.error('Streaming error:', e);
                const { body: errorBody } = createErrorResponse(e);
                stream.writeSSE({
                    data: JSON.stringify(errorBody)
                });
            }
        });
    } catch (error) {
        console.error('Generate content stream error:', error);
        const { status, body: errorBody } = createErrorResponse(error);
        return c.json(errorBody, status);
    }
}

// Embeddings
async function handleEmbedContent(c: Context, model: string, apiKey: string, body: any): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const contents = body.contents;

    try {
        const response = await ai.models.embedContent({
            model,
            contents,
            config: {
                taskType: body.task_type,
            }
        });
        return c.json({
            embedding: response?.embeddings?.[0] || { values: [] }
        });
    } catch (error) {
        console.error('Embed content error:', error);
        const { status, body: errorBody } = createErrorResponse(error);
        return c.json(errorBody, status);
    }
}

// 内容生成路由
genai.post('/models/:modelAction{.+:.+}', async (c: Context) => {
    const modelAction = c.req.param('modelAction');
    const [model, action] = modelAction.split(':');

    // 验证模型和操作是否存在
    if (!model || !action) {
        const errorResponse = createErrorResponse({
            message: "无效的请求路径格式，预期格式: /v1beta/models/{model}:{action}",
            type: "invalid_request_error",
            status: 400
        });
        return c.json(errorResponse.body, errorResponse.status);
    }

    // 获取对应的处理函数
    const handler = actionHandlers[action];

    if (!handler) {
        const errorResponse = createErrorResponse({
            message: "不支持的操作: ${action}",
            type: "invalid_request_error",
            status: 400
        });
        return c.json(errorResponse.body, errorResponse.status);
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
    const data = await response.json() as Record<string, any>;
    return c.json(data);
})

// 检索模型
genai.get('/models/:model', async (c: Context) => {
    const model = c.req.param('model');
    const API_KEY = getApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json() as Record<string, any>;
    return c.json(data);
})

// OpenAI 格式的 Embeddings
genai.post('/openai/embeddings', async (c) => {
    const body = await c.req.json();
    const { model, input, encoding_format, dimensions } = body;

    if (!model || !input) {
        const errorResponse = createErrorResponse({
            message: "请求体必须包含 'model' 和 'input' 参数。",
            type: "invalid_request_error",
            status: 400
        });
        return c.json(errorResponse.body, errorResponse.status);
    }

    const openai = new OpenAI({
        apiKey: getApiKey(model),
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
    });

    try {
        const embeddingResponse = await openai.embeddings.create({
            model: model,
            input: input,
            ...(encoding_format && { encoding_format: encoding_format }),
            ...(dimensions && { dimensions: dimensions })
        });

        return c.json(embeddingResponse);
    } catch (error: any) {
        console.error('创建 Embeddings 时出错:', error);
        const { status, body } = createErrorResponse(error);
        return c.json(body, status);
    }
});

export default genai;
