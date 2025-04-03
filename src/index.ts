import { Hono } from 'hono'
import oai from './utils/openai';
import genai from './utils/gemini';

const app = new Hono()

const API_PREFIX: string = process.env.API_PREFIX ?? '';

// OpenAI API 兼容格式
app.route(API_PREFIX + '/v1', oai)

// Google Gemini API 格式
app.route(API_PREFIX + '/v1beta', genai)

export default app
