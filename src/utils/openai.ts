import { Hono } from 'hono';
import OpenAI from 'openai';
import getGeminiAPIKey from './getGeminiAPIKey';

const oai = new Hono();

const baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";

// 创建聊天
oai.post('/chat/completions', async (c) => {
    const { messages, model, tools, tool_choice, stream = false } = await c.req.json()

    const openai = new OpenAI({
        apiKey: getGeminiAPIKey(),
        baseURL: baseURL
    });

    try {
        // 处理流式响应
        if (stream) {
            // 创建流式请求
            const completion = await openai.chat.completions.create({
                model: model,
                messages: messages,
                tools: tools,
                tool_choice: tool_choice,
                stream: true,
            });

            // 使用Response对象作为流式响应
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                async start(controller) {
                    for await (const chunk of completion) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                    }
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
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

        // 非流式响应
        const response = await openai.chat.completions.create({
            model: model,
            messages: messages,
            tools: tools,
            tool_choice: tool_choice,
        });

        return c.json(response);
    } catch (error: any) {
        console.error('API调用错误:', error);
        const status = error.status || 400;
        return c.json({ error: { message: error.message, type: error.type || "invalid_request_error" } }, status);
    }
})

// 列出模型
oai.get('/models', async (c) => {
    const openai = new OpenAI({
        apiKey: getGeminiAPIKey(),
        baseURL: baseURL
    });

    try {
        const list = await openai.models.list();

        const models = [];
        for await (const model of list) {
            models.push(model);
        }

        // 按照OpenAI标准格式返回
        return c.json({
            object: "list",
            data: models
        });
    } catch (error: any) {
        console.error('获取模型错误:', error);
        const status = error.status || 400;
        return c.json({ error: { message: error.message, type: error.type || "invalid_request_error" } }, status);
    }
})

// 检索模型
oai.get('/models/:model', async (c) => {
    const { model: modelId } = c.req.param();
    const openai = new OpenAI({
        apiKey: getGeminiAPIKey(),
        baseURL: baseURL
    });

    try {
        const model = await openai.models.retrieve(modelId);
        return c.json(model);
    } catch (error: any) {
        console.error('获取模型错误:', error);
        const status = error.status || 400;
        return c.json({ error: { message: error.message, type: error.type || "invalid_request_error" } }, status);
    }
})

// 生成图片
oai.post('/images/generations', async (c) => {
    const { prompt, n = 1, size, model = "imagen-3.0-generate-002", response_format = "b64_json" } = await c.req.json();

    const openai = new OpenAI({
        apiKey: getGeminiAPIKey(),
        baseURL: baseURL
    });

    try {
        const imageResponse = await openai.images.generate({
            model,
            prompt,
            response_format,
            n,
            size
        });

        const standardResponse = {
            created: Math.floor(Date.now() / 1000),
            data: Array.isArray(imageResponse.data) ? imageResponse.data : [],
            object: "images"
        };

        return c.json(standardResponse);
    } catch (error: any) {
        console.error('生成图片错误:', error);
        const status = error.status || 400;
        return c.json({ error: { message: error.message, type: error.type || "invalid_request_error" } }, status);
    }
})

export default oai;