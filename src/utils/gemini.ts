import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { GoogleGenAI } from "@google/genai";
import { getAPIKey, createErrorResponse } from './utils';
import { openaiAuthMiddleware, geminiAuthMiddleware } from './middleware'
import type { Context } from 'hono';

const genai = new Hono();

genai.use('/model/*', geminiAuthMiddleware);
genai.use('/openai/*', openaiAuthMiddleware);


// 定义基本类型
type HandlerFunction = (c: Context, model: string, apiKey: string) => Promise<Response>;

// 操作处理器映射
const actionHandlers: Record<string, HandlerFunction> = {
    generateContent: handleGenerateContent,             // 非流式内容处理
    generateContentStream: handleGenerateContentStream, // 流式内容处理
    streamGenerateContent: handleGenerateContentStream, // 流式内容处理
    countTokens: handleCountTokens,                     // 计算 token 数量
    embedContent: handleEmbedContent,                   // 文本嵌入向量
};


/**
 * 将 Gemini API 请求体转换为标准格式
 * 
 * Gemini API 要求某些配置字段位于 config 对象内，而非顶层对象
 * 此函数将请求体中的特定字段移动到 config 对象中
 * 
 * @param model - 模型名称 (可选)
 * @param body - 原始请求体
 * @returns 格式化后的请求体
 */
function convertRequestFormat(model: string = '', body: any) {
    // 对非对象输入进行保护，直接返回原值
    if (!body || typeof body !== 'object') { return body; }
    // 创建请求体副本，避免修改原对象
    const formattedRequest = { ...body };
    // 确保 config 对象存在
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
            // 移动字段到 config 对象
            formattedRequest.config[fieldName] = formattedRequest[fieldName];
            // 删除顶层字段
            delete formattedRequest[fieldName];
        }
    });
    // 特殊处理：generationConfig 对象的内容需合并到 config 中
    if (formattedRequest.generationConfig) {
        // 将 generationConfig 中的所有属性合并到 config
        formattedRequest.config = {
            ...formattedRequest.config,
            ...formattedRequest.generationConfig
        };
        // 删除原 generationConfig 对象
        delete formattedRequest.generationConfig;
    }
    return formattedRequest;
}

// 文本嵌入向量
async function handleEmbedContent(c: Context, model: string, apiKey: string): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const body = await c.req.json();
    const contents = body.content.parts.map((part: any) => part.text);
    try {
        const response = await ai.models.embedContent({
            model,
            contents,
            config: {
                taskType: body.task_type,
                title: body.title
            }
        });
        return c.json({
            embedding: response?.embeddings?.[0] || { values: [] }
        });
    } catch (error) {
        console.error('Embed content error:', error);
        return c.json(createErrorResponse(error), 500);
    }
}

// 计算 Token 数量
async function handleCountTokens(c: Context, model: string, apiKey: string): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const originalBody = await c.req.json();
    const body = convertRequestFormat(model, originalBody);

    try {
        const response = await ai.models.countTokens({
            model,
            ...body,
        });

        return c.json(response);
    } catch (error) {
        console.error('Count tokens error:', error);
        return c.json(createErrorResponse(error), 500);
    }
}

// 非流式内容处理
async function handleGenerateContent(c: Context, model: string, apiKey: string): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const originalBody = await c.req.json();
    const body = convertRequestFormat(model, originalBody);

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
async function handleGenerateContentStream(c: Context, model: string, apiKey: string): Promise<Response> {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const originalBody = await c.req.json();
    const isGoogleClient = c.req.header('x-goog-api-client')?.includes('genai-js') || false;
    const body = convertRequestFormat(model, originalBody);
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
genai.post('/models/:modelAction', async (c: Context) => {
    const modelAction = c.req.param('modelAction');
    console.log(`接收到请求: ${modelAction}`);

    // 解析请求体并记录大小
    let requestBody;
    try {
        requestBody = await c.req.json();
        console.log(`请求体大小约: ${JSON.stringify(requestBody).length / 1024}KB`);
    } catch (err) {
        console.error("无法解析请求体:", err);
        return c.json({ error: 'Invalid request body' }, 400);
    }

    // 解析模型名称和操作
    const [model, action] = modelAction.split(':');

    // 验证模型和操作是否存在
    if (!model || !action) {
        return c.json({
            error: '无效的请求路径格式，预期格式: /v1beta/models/{model}:{action}'
        }, 400);
    }

    // 获取对应的处理函数
    const handler = actionHandlers[action];
    if (!handler) {
        return c.json({
            error: `不支持的操作: ${action}，支持的操作: ${Object.keys(actionHandlers).join(', ')}`
        }, 400);
    }

    // 执行处理函数
    const apiKey = getAPIKey();
    return handler(c, model, apiKey);
});

// 获取所有模型
genai.get('/models', async (c: Context) => {
    const API_KEY = getAPIKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json() as Record<string, any>;
    return c.json(data);
})

// 检索模型
genai.get('/models/:model', async (c: Context) => {
    const model = c.req.param('model');
    const API_KEY = getAPIKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json() as Record<string, any>;
    return c.json(data);
})

export default genai;
