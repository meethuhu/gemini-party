import type { Context } from 'hono';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import OpenAI from 'openai';

import { getApiKey, withRetry, withoutBalancing } from '../utils/apikey.ts';
import { createErrorResponse, createHonoErrorResponse } from '../utils/error';
import { geminiAuthMiddleware, openaiAuthMiddleware } from '../utils/middleware';
import normalizeRequestBody from '../utils/rebody';

// 从环境变量读取自定义 Gemini API 端点，如果未定义则使用默认值
// @ts-ignore Deno global
const GEMINI_API_ENDPOINT = typeof process !== 'undefined' && process.env && process.env.GEMINI_API_ENDPOINT
    // @ts-ignore Deno global
    ? process.env.GEMINI_API_ENDPOINT
    : 'https://generativelanguage.googleapis.com/v1beta';

// Helper function to get custom cost header
function getCustomCostHeader(model: string): string | null {
    // @ts-ignore Deno global
    if (typeof process === 'undefined' || !process.env) {
        return null;
    }
    const modelNormalized = model.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    // @ts-ignore Deno global
    const costIn = process.env[`MODEL_${modelNormalized}_COST_IN`];
    // @ts-ignore Deno global
    const costOut = process.env[`MODEL_${modelNormalized}_COST_OUT`];

    if (costIn && costOut) {
        try {
            const perTokenIn = parseFloat(costIn);
            const perTokenOut = parseFloat(costOut);
            if (!isNaN(perTokenIn) && !isNaN(perTokenOut)) {
                return JSON.stringify({ per_token_in: perTokenIn, per_token_out: perTokenOut });
            }
        } catch (e) {
            console.error(`Error parsing custom cost for model ${model}:`, e);
        }
    }
    return null;
}

// 辅助函数：构造 Gemini API URL
function constructGeminiUrl(model: string, action: string, apiKey: string, params?: Record<string, string>): string {
    let baseUrl = `${GEMINI_API_ENDPOINT}/models/${model}:${action}?key=${apiKey}`;
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            baseUrl += `&${key}=${value}`;
        }
    }
    return baseUrl;
}

// 辅助函数：构造 Gemini 获取模型信息的 URL (不带 action)
function constructGeminiModelInfoUrl(apiKey: string, model?: string): string {
    if (model) {
        return `${GEMINI_API_ENDPOINT}/models/${model}?key=${apiKey}`;
    }
    return `${GEMINI_API_ENDPOINT}/models?key=${apiKey}`;
}

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
    const body = normalizeRequestBody(originalBody, model);

    // 显式删除 thinkingConfig 以避免 API 错误
    if (body.generationConfig && body.generationConfig.hasOwnProperty('thinkingConfig')) {
        // @ts-ignore 如果 thinkingConfig 确实不应该存在于类型中，这会是一个类型错误，但我们在这里处理运行时问题
        delete body.generationConfig.thinkingConfig;
    }
    // 显式删除 tools 和 systemInstruction 以避免 API 错误
    // @ts-ignore 根据错误日志，API 端点不识别这些顶层字段
    if (body.hasOwnProperty('tools')) {
        delete body.tools;
    }
    // @ts-ignore
    if (body.hasOwnProperty('systemInstruction')) {
        delete body.systemInstruction;
    }

    try {
        // 使用withRetry包装API调用
        const response = await withRetry(model, async (key) => {
            // 使用辅助函数构造 URL
            const apiUrl = constructGeminiUrl(model, 'generateContent', key);
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            // @ts-ignore Deno global
            if (GEMINI_API_ENDPOINT && GEMINI_API_ENDPOINT.includes('gateway.ai.cloudflare.com')) {
                const customCostHeader = getCustomCostHeader(model);
                if (customCostHeader) {
                    headers['cf-aig-custom-cost'] = customCostHeader;
                }
            }

            const fetchResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
            });
            if (!fetchResponse.ok) {
                const errorText = await fetchResponse.text();
                throw new Error(`API 请求失败，状态码: ${fetchResponse.status}: ${errorText}`);
            }
            return await fetchResponse.json() as Record<string, any>;
        });

        return c.json(response);
    } catch (error) {
        console.error('Generate content error:', error);
        return createHonoErrorResponse(c, error);
    }
}

// 流式内容处理
async function handleGenerateContentStream(c: Context, model: string,
    apiKey: string, originalBody: any): Promise<Response> {
    const body = normalizeRequestBody(originalBody, model);

    // 显式删除 thinkingConfig 以避免 API 错误
    if (body.generationConfig && body.generationConfig.hasOwnProperty('thinkingConfig')) {
        // @ts-ignore 如果 thinkingConfig 确实不应该存在于类型中，这会是一个类型错误，但我们在这里处理运行时问题
        delete body.generationConfig.thinkingConfig;
    }
    // 显式删除 tools 和 systemInstruction 以避免 API 错误
    // @ts-ignore 根据错误日志，API 端点不识别这些顶层字段
    if (body.hasOwnProperty('tools')) {
        delete body.tools;
    }
    // @ts-ignore
    if (body.hasOwnProperty('systemInstruction')) {
        delete body.systemInstruction;
    }

    try {
        // 使用withRetry包装API调用
        const result = await withRetry(model, async (key) => {
            // 使用辅助函数构造 URL
            const apiUrl = constructGeminiUrl(model, 'streamGenerateContent', key, { alt: 'sse' });
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            // @ts-ignore Deno global
            if (GEMINI_API_ENDPOINT && GEMINI_API_ENDPOINT.includes('gateway.ai.cloudflare.com')) {
                const customCostHeader = getCustomCostHeader(model);
                if (customCostHeader) {
                    headers['cf-aig-custom-cost'] = customCostHeader;
                }
            }

            const fetchResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
            });
            if (!fetchResponse.ok) {
                const errorText = await fetchResponse.text();
                throw new Error(`API 请求失败，状态码: ${fetchResponse.status}: ${errorText}`);
            }
            return fetchResponse.body; // 直接返回 ReadableStream
        });

        // Hono 流式响应
        return streamSSE(c, async (stream) => {
            if (!result) {
                // 如果withRetry正常工作并在出错时抛出异常，这里不应该发生
                console.error('流式处理错误: result 为 null');
                const { body: errorBody } = createErrorResponse({ message: '流生成失败，无响应体' });
                await stream.writeSSE({
                    data: JSON.stringify(errorBody),
                });
                return;
            }
            const reader = result.getReader();
            const decoder = new TextDecoder();
            let lineBuffer = ''; // Buffer for accumulating line data

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        // Process any remaining data in lineBuffer if the stream ends
                        if (lineBuffer.trim()) {
                            if (lineBuffer.startsWith('data: ')) {
                                const jsonData = lineBuffer.substring(5).trim();
                                if (jsonData) {
                                    try {
                                        const parsedJson = JSON.parse(jsonData);
                                        await stream.writeSSE({ data: JSON.stringify(parsedJson) });
                                    } catch (e) {
                                        console.error('从流式块解析JSON时出错 (final buffer):', `'${jsonData}'`, e);
                                    }
                                }
                            }
                        }
                        break; // Exit loop when stream is done
                    }

                    // Decode the current chunk and append to lineBuffer
                    lineBuffer += decoder.decode(value, { stream: true });

                    // Process all complete lines in the buffer
                    let newlineIndex;
                    while ((newlineIndex = lineBuffer.indexOf('\n')) >= 0) {
                        const line = lineBuffer.substring(0, newlineIndex); // Extract one line
                        lineBuffer = lineBuffer.substring(newlineIndex + 1);  // Remove the processed line (and the newline) from buffer

                        if (line.startsWith('data: ')) {
                            const jsonData = line.substring(5).trim(); // Remove "data: " prefix and trim
                            if (jsonData) { // Ensure jsonData is not empty
                                try {
                                   const parsedJson = JSON.parse(jsonData);
                                   await stream.writeSSE({
                                       data: JSON.stringify(parsedJson), // Hono expects string data
                                   });
                                } catch (e) {
                                    console.error('从流式块解析JSON时出错:', `'${jsonData}'`, e); 
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Streaming error:', e); // Catch errors from reader.read or stream.writeSSE
                try {
                    const { body } = createErrorResponse(e);
                    await stream.writeSSE({
                        data: JSON.stringify(body), // Send an error structure
                    });
                } catch (streamError) {
                    console.error("Error writing error to SSE stream:", streamError);
                }
            }
        });
    } catch (error) {
        console.error('Generate content stream error:', error);
        return createHonoErrorResponse(c, error);
    }
}

// Embeddings
async function handleEmbedContent(c: Context, model: string, apiKey: string, body: any): Promise<Response> {
    const contents = body.content; // 对于REST API，这里应该是 `body.contents`
    const requestBody = {
        content: body.content, // 确保这与REST API预期的结构匹配
        task_type: body.task_type,
        title: body.title,
        output_dimensionality: body.outputDimensionality, // 已修正字段名
    };

    try {
        // 使用withRetry包装API调用
        const response = await withRetry(model, async (key) => {
            // 使用辅助函数构造 URL
            const apiUrl = constructGeminiUrl(model, 'embedContent', key);
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            // @ts-ignore Deno global
            if (GEMINI_API_ENDPOINT && GEMINI_API_ENDPOINT.includes('gateway.ai.cloudflare.com')) {
                const customCostHeader = getCustomCostHeader(model);
                if (customCostHeader) {
                    headers['cf-aig-custom-cost'] = customCostHeader;
                }
            }
            
            const fetchResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
            });
            if (!fetchResponse.ok) {
                const errorText = await fetchResponse.text();
                throw new Error(`API 请求失败，状态码: ${fetchResponse.status}: ${errorText}`);
            }
            return await fetchResponse.json() as { embedding?: { values: number[] } }; // 为嵌入响应添加了特定类型
        });

        return c.json({
            embedding: response?.embedding || { values: [] }, // 已调整以匹配新的响应结构
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
    return handler(c, model, '', body);
});

// 获取所有模型
genai.get('/models', async (c: Context) => {
    try {
        const data = await withoutBalancing(async (key) => {
            // 使用辅助函数构造 URL
            const url = constructGeminiModelInfoUrl(key);
            const headers: Record<string, string> = {};

            // Add custom cost header if applicable (though less common for /models endpoint)
            // @ts-ignore Deno global
            if (GEMINI_API_ENDPOINT && GEMINI_API_ENDPOINT.includes('gateway.ai.cloudflare.com')) {
                 const customCostHeader = getCustomCostHeader(key); // Use key here
                 if (customCostHeader) {
                     headers['cf-aig-custom-cost'] = customCostHeader;
                 }
            }

            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error(`获取模型列表失败: ${response.statusText}`);
            }
            return await response.json() as Record<string, any>;
        });

        return c.json(data);
    } catch (error) {
        console.error('获取模型列表错误:', error);
        return createHonoErrorResponse(c, error);
    }
});

// 检索模型
genai.get('/models/:model', async (c: Context) => {
    const modelName = c.req.param('model'); // 使用 modelName 保证唯一性

    try {
        const data = await withoutBalancing(async (key) => {
            // 使用辅助函数构造 URL，并传递 modelName
            const url = constructGeminiModelInfoUrl(key, modelName);
            const headers: Record<string, string> = {};

            // Add custom cost header if applicable (though less common for /models endpoint)
            // @ts-ignore Deno global
            if (GEMINI_API_ENDPOINT && GEMINI_API_ENDPOINT.includes('gateway.ai.cloudflare.com') && modelName) {
                 const customCostHeader = getCustomCostHeader(modelName); // Use modelName here
                 if (customCostHeader) {
                     headers['cf-aig-custom-cost'] = customCostHeader;
                 }
            }

            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error(`获取模型信息失败: ${response.statusText}`);
            }
            return await response.json() as Record<string, any>;
        });

        return c.json(data);
    } catch (error) {
        console.error(`获取模型 ${modelName} 信息错误:`, error);
        return createHonoErrorResponse(c, error);
    }
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

    try {
        const embeddingResponse = await withRetry(model, async (key) => {
            const openai = new OpenAI({
                apiKey: key,
                // @ts-ignore Deno global
                baseURL: (typeof process !== 'undefined' && process.env && process.env.GEMINI_OPENAI_COMPAT_ENDPOINT) || 'https://generativelanguage.googleapis.com/v1beta/openai/' // Allow override for OpenAI compat endpoint
            });

            // Prepare headers for OpenAI client (if it allows header injection, otherwise this needs adjustment)
            // This part is tricky as OpenAI client might not directly expose header modification for each request in a simple way.
            // For now, assuming we are proxying this through a custom fetch that we can control,
            // or if the baseURL IS the Cloudflare Gateway.

            const headers: Record<string, string> = {};
            // @ts-ignore Deno global
            const currentBaseUrl = (typeof process !== 'undefined' && process.env && process.env.GEMINI_OPENAI_COMPAT_ENDPOINT) || 'https://generativelanguage.googleapis.com/v1beta/openai/';
            // @ts-ignore Deno global
            if (currentBaseUrl.includes('gateway.ai.cloudflare.com')) {
                const customCostHeader = getCustomCostHeader(model);
                if (customCostHeader) {
                    // How to add this header depends on how OpenAI client is used or if it's a direct fetch.
                    // If OpenAI client internally uses fetch, we might need to wrap/patch it or use a different mechanism.
                    // For a direct fetch, this would be: headers['cf-aig-custom-cost'] = customCostHeader;
                    // This example assumes a direct fetch or a client that allows header injection.
                    // If not, this specific part for OpenAI embeddings might not work directly without more complex changes.
                    // Cloudflare AI Gateway's primary method is via direct HTTP headers,
                    // so if the SDK call abstracts this away, it's an issue.
                    // However, the user's primary request was for the Gemini endpoint via fetch.
                }
            }
            
            // If the OpenAI SDK doesn't allow custom headers per request easily,
            // and if GEMINI_OPENAI_COMPAT_ENDPOINT is set to Cloudflare,
            // this header addition might need to be handled by a proxy layer or a modified SDK.
            // The original request focused on the direct fetch calls in gemini.ts, which are being addressed.

            return await openai.embeddings.create({
                model: model,
                input: input,
                ...(encoding_format && { encoding_format: encoding_format as any }),
                ...(dimensions && { dimensions: dimensions }),
                // ...(Object.keys(headers).length > 0 && { extraHeaders: headers }) // Example if SDK supports it
            });
        });

        return c.json(embeddingResponse);
    } catch (error: any) {
        console.error('创建 Embeddings 时出错:', error);
        return createHonoErrorResponse(c, error);
    }
});

export default genai;
