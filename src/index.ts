import { Hono } from 'hono'
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import oai from './utils/openai';

const app = new Hono()

const API_PREFIX: string = process.env.API_PREFIX ?? '';

app.route(API_PREFIX + '/v1', oai)
export default app
