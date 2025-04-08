import { Hono } from "hono";

import genai from "./api/gemini";
import oai from "./api/openai";
import { getRotationStatus } from "./utils/apikey.ts";
import { createHonoErrorResponse } from "./utils/error";
import validateHarmCategories from "./utils/safety";
import { config } from './utils/config';

const app = new Hono();

// 启动时检测设置
validateHarmCategories();

// API 前缀
const API_PREFIX: string = config.api.API_PREFIX ?? "";

app.route(API_PREFIX + "/v1", oai);
app.route(API_PREFIX + "/v1beta", genai);

// 添加API密钥轮询状态端点
app.get(API_PREFIX + '/rotation-status', async (c) => {
    try {
        const status = await getRotationStatus();
        return c.json({
            status: "success",
            data: status
        });
    } catch (error) {
        console.error('获取轮询状态出错:', error);
        return createHonoErrorResponse(c, {
            message: '获取轮询状态时发生错误',
            type: 'internal_server_error',
            status: 500,
        });
    }
});

// 添加robots.txt端点,禁止爬虫
app.get("/robots.txt", async (c) => {
    return c.text("User-agent: *\nDisallow: /");
});

// 导出为 Bun 兼容格式
export default app;