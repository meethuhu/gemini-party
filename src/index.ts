import { Hono } from 'hono'
import oai from './utils/openai'
import genai from './utils/gemini'

const app = new Hono()

const API_PREFIX: string = process.env.API_PREFIX ?? ''

app.route(API_PREFIX + '/v1', oai)
app.route(API_PREFIX + '/v1beta', genai)

// 导出为 Bun 兼容格式
export default {
  port: 3000,
  hostname: '0.0.0.0',  // 可以在这里指定端口
  fetch: app.fetch
}
