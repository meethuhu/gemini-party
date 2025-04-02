import { Hono } from 'hono';
import OpenAI from 'openai';
import getGeminiAPIKey from './getGeminiAPIKey';
import type { ChatCompletionCreateParams, ImageGenerateParams, EmbeddingCreateParams } from 'openai/resources';

const oai = new Hono();

const baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";

// OAI工厂函数
function getOpenAIClient() {
    return new OpenAI({
        apiKey: getGeminiAPIKey(),
        baseURL: baseURL
    });
}

// 错误处理函数
function createErrorResponse(error: any) {
    const status = error.status || 500;
    const message = error.error?.message || error.message || 'Unknown error';
    const type = error.error?.type || error.type || "invalid_request_error";
    return { status, body: { error: { message, type } } };
}


// --- 创建聊天 ---
oai.post('/chat/completions', async (c) => {
    const { messages, model, tools, tool_choice, stream = false } =
        await c.req.json() as ChatCompletionCreateParams & { stream?: boolean };
    const openai = getOpenAIClient();

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
        const { status, body } = createErrorResponse(error);
        return c.json(body, status);
    }
})


// --- 列出模型 ---
oai.get('/models', async (c) => {
    const openai = getOpenAIClient();

    try {
        const models = await openai.models.list();
        return c.json({
            object: "list",
            data: models.data
        });
    } catch (error: any) {
        console.error('获取模型错误:', error);
        const { status, body } = createErrorResponse(error);
        return c.json(body, status);
    }
})


// --- 检索模型 ---
oai.get('/models/:model', async (c) => {
    const { model: modelId } = c.req.param();
    const openai = getOpenAIClient();

    try {
        const model = await openai.models.retrieve(modelId);
        return c.json(model);
    } catch (error: any) {
        console.error('获取模型错误:', error);
        const { status, body } = createErrorResponse(error);
        return c.json(body, status);
    }
})


// --- 生成图片 ---
oai.post('/images/generations', async (c) => {
    const { prompt, n = 1, size, model = "imagen-3.0-generate-002", response_format = "b64_json" } =
        await c.req.json() as ImageGenerateParams;
    const openai = getOpenAIClient();

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
        const { status, body } = createErrorResponse(error);
        return c.json(body, status);
    }
})


// --- Embeddings ---
oai.post('/embeddings', async (c) => {
    const { model, input, encoding_format, dimensions } =
        await c.req.json() as EmbeddingCreateParams;

    if (!model || !input) {
        const errorResponse = createErrorResponse({
            message: "请求体必须包含 'model' 和 'input' 参数。",
            type: "invalid_request_error",
            status: 400
        });
        return c.json(errorResponse.body, errorResponse.status);
    }

    const openai = getOpenAIClient();

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


export default oai;