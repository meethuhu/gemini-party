import { Hono } from "hono";

import genai from "./api/gemini";
import oai from "./api/openai";
import { getRotationStatus } from "./utils/apikey";
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

app.get("/info", async (c) => {
    try {
        const status = getRotationStatus();
        return c.json({
            status: "success", data: status,
        });
    } catch (error: any) {
        console.error("获取轮训状态错误:", error);
        return createHonoErrorResponse(c, error);
    }
});

// 导出为 Bun 兼容格式
export default app;