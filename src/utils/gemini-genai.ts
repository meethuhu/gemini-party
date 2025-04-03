import { GoogleGenAI } from "@google/genai";
import type { Content } from "@google/genai";

import { Hono } from 'hono';

import getAPIKey from './get-apikey';
import checkAuth from './auth';
import createErrorResponse from './error';

const genai = new Hono();

// 非流式内容
async function generateContent(ai: GoogleGenAI,
    model: string,
    body: any,
    systemInstruction: Content | undefined) {
    try {
        const response = await ai.models.generateContent({
            model: model,
            ...body,
            config: {
                ...(body.config || {}),
                ...(systemInstruction && { systemInstruction }),
            },
        });
        return response;
    } catch (error: any) {
        console.error('Generate content error:', error);
        throw error;
    }
}

// 流式内容
async function generateContentStream(ai: GoogleGenAI,
    model: string,
    body: any,
    isGoogleClient: boolean,
    systemInstruction: Content | undefined) {
    try {
        const result = await ai.models.generateContentStream({
            model: model,
            ...body,
            config: {
                ...(body.config || {}),
                ...(systemInstruction && { systemInstruction }),
            },
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
                    // 非Google客户端，添加结束标记
                    if (!isGoogleClient) {
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    }
                    controller.close();
                } catch (e) {
                    const { status, body } = createErrorResponse(e);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: body })}\n\n`));
                    controller.close();
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
    } catch (error: any) {
        console.error('Generate content stream error:', error);
        throw error;
    }
}

// 验证请求体
function validateRequestBody(body: any) {
    if (!body.contents && !body.content) {
        return { valid: false, message: "Missing required field: contents or content" };
    }
    return { valid: true };
}

genai.post('/models/:model_type', async (c) => {
    // 分割请求参数（Hono + Gemini 难受的一批）
    const model_type = c.req.param('model_type');
    const [model, type] = model_type.split(':');

    if (!model || !type) {
        return c.json({ error: 'Invalid path format. Expected format: /models/{model}:{type}' }, 400);
    }

    // 检查 APIKEY
    const apiKey = c.req.header('x-goog-api-key') || c.req.query('key');
    if (!checkAuth(apiKey)) return c.json({ error: 'Invalid API key' }, 401);

    try {
        // 获取请求体
        const reqBody = await c.req.json();

        // 验证请求体
        const validation = validateRequestBody(reqBody);
        if (!validation.valid) {
            return c.json({ error: validation.message }, 400);
        }

        // 提取并移除系统指令，以免重复设置
        const systemInstruction = reqBody.systemInstruction;
        // 复制一份reqBody，避免直接修改原始对象
        const processedBody = { ...reqBody };
        delete processedBody.systemInstruction;

        const isGoogleClient = c.req.header('x-goog-api-client')?.includes('genai-js') || false;

        // 创建 Gemini 实例
        const ai = new GoogleGenAI({ apiKey: getAPIKey() });

        // 非流式内容 
        if (type === 'generateContent') {
            const response = await generateContent(ai, model, processedBody, systemInstruction);
            return c.json(response);
        }

        // 流式内容
        if (type === 'generateContentStream') {
            return await generateContentStream(ai, model, processedBody, isGoogleClient, systemInstruction);
        }
        return c.json({ error: `Unsupported content type: ${type}` }, 400);

    } catch (error: any) {
        console.error('API调用错误:', error);
        const { status, body } = createErrorResponse(error);
        return c.json(body, status);
    }
});

// export default genai;
