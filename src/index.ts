import { Hono } from 'hono'
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import oai from './utils/openai';
import genai from './utils/gemini';

const app = new Hono()

const API_PREFIX: string = process.env.API_PREFIX ?? '';

// OpenAI API 兼容层
app.route(API_PREFIX + '/v1', oai)

// Google Gemini API 兼容层
app.route(API_PREFIX + '/v1', genai)

export default app
