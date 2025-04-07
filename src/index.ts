import { Hono } from 'hono';

import genai from './gemini';
import oai from './openai';
import { getRotationStatus } from './utils/apikey';
import createErrorResponse from './utils/error';
import validateHarmCategories from './utils/safety';

const app = new Hono();

// 启动时检测设置
validateHarmCategories();

// API 前缀
const API_PREFIX: string = process.env.API_PREFIX ?? '';

app.route(API_PREFIX + '/v1', oai);
app.route(API_PREFIX + '/v1beta', genai);

app.get('/info', async (c) => {
  try {
    const status = getRotationStatus();
    return c.json({
      status: 'success',
      data: status,
    });
  } catch (error: any) {
    console.error('获取轮训状态错误:', error);
    const { status, body } = createErrorResponse(error);
    return c.json(body, status);
  }
});

// app.all('/*', async (c) => {
//   console.log('Path:', c.req.path);

//   // 打印查询参数
//   const query = c.req.query();
//   console.log('Query:', query);

//   // 打印所有请求头
//   const headers = Object.fromEntries(c.req.raw.headers.entries());
//   console.log('Headers:', headers);

//   // 打印请求体 (需要 await)
//   try {
//     const body = await c.req.json();
//     console.log('Body:', body);
//   } catch (e) {
//     console.log('No JSON body');
//   }
// });

// 导出为 Bun 兼容格式
export default {
  port: 3000,
  hostname: '0.0.0.0', // 可以在这里指定端口
  fetch: app.fetch,
};
