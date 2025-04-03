import { Hono } from 'hono';
import { GoogleGenAI } from "@google/genai";
import getGeminiAPIKey from './getGeminiAPIKey';
import type { GenerateContentParameters } from '@google/genai';
import createErrorResponse from './error';
import checkAuth from './auth';
const genai = new Hono();

// Gemini客户端工厂函数
function getGeminiClient(): GoogleGenAI {
    return new GoogleGenAI({ apiKey: getGeminiAPIKey() });
}

genai.post('/models/:fullPath', async (c) => {
    const fullPath = c.req.param('fullPath');
    const [modelName, contentType] = fullPath.split(':');
    const apiKey = c.req.query('key');

    if (!apiKey || !checkAuth(apiKey)) {
        return c.json({ error: 'Invalid API key' }, 401);
    }

    try {
        const ai = getGeminiClient();
        const body = await c.req.json();
        if (!modelName || !contentType) {
            return c.json({ error: 'Invalid path format' }, 400);
        }

        if (contentType === 'generateContent') {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: body.contents,
            });
            return c.json(response);
        }
    } catch (error: any) {
        console.error('API调用错误:', error);
        const { status, body } = createErrorResponse(error);
        return c.json(body, status);
    }
});

export default genai;