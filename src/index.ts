import { Hono } from 'hono'
import oai from './openai'
import genai from './gemini'

import validateHarmCategories from './utils/safety'
import createErrorResponse from './utils/error'
import { getRotationStatus } from './utils/apikey'

const app = new Hono()

// 启动时检测设置
validateHarmCategories();

// 
const API_PREFIX: string = process.env.API_PREFIX ?? ''

app.route(API_PREFIX + '/v1', oai)
app.route(API_PREFIX + '/v1beta', genai)

app.get('/info', async (c) => {
  try {
    const status = getRotationStatus();
    return c.json({
      status: 'success',
      data: status
    });
  } catch (error: any) {
    console.error('获取轮训状态错误:', error);
    const { status, body } = createErrorResponse(error);
    return c.json(body, status);
  }
})

// 导出为 Bun 兼容格式
export default {
  port: 3000,
  hostname: '0.0.0.0',  // 可以在这里指定端口
  fetch: app.fetch
}
