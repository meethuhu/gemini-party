/**
 * Gemini Party v0.0.17
 * 构建时间: 2025-04-09T06:04:46.977Z
 * https://github.com/your-username/gemini-party
 */

// src/index.ts
import { Hono as Hono3 } from "npm:hono@4.7.5";

// src/api/gemini.ts
import { GoogleGenAI } from "npm:@google/genai@0.7.0";
import { Hono } from "npm:hono@4.7.5";
import { streamSSE } from "npm:hono@4.7.5/streaming";
import OpenAI from "npm:openai@4.92.1";

// src/utils/config.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
var version = '0.0.17'; // 自动构建于 2025-04-09T06:04:46.977Z
try {
  if (typeof Deno === "undefined") {
    const __filename2 = fileURLToPath(import.meta.url);
    const __dirname2 = path.dirname(__filename2);
    const packageJsonPath = path.join(__dirname2, "..", "..", "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      version = packageJson.version || version;
    }
  }
} catch (error) {
  console.warn("读取版本信息失败，使用默认版本号:", error);
}
var config = {
  version,
  api: {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    AUTH_TOKEN: process.env.AUTH_TOKEN,
    API_PREFIX: process.env.API_PREFIX
  },
  keyManagement: {
    kvPrefix: "gemini_party_api_rotation",
    rotationResetInterval: Number(process.env.ROTATION_RESET_INTERVAL) || 60000,
    blacklistTimeout: Number(process.env.BLACKLIST_TIMEOUT) || 300000,
    defaultMaxRetries: Number(process.env.DEFAULT_MAX_RETRIES) || 3
  },
  safety: {
    HARM_CATEGORY_HARASSMENT: process.env.HARM_CATEGORY_HARASSMENT,
    HARM_CATEGORY_DANGEROUS_CONTENT: process.env.HARM_CATEGORY_DANGEROUS_CONTENT,
    HARM_CATEGORY_SEXUALLY_EXPLICIT: process.env.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    HARM_CATEGORY_HATE_SPEECH: process.env.HARM_CATEGORY_HATE_SPEECH,
    HARM_CATEGORY_CIVIC_INTEGRITY: process.env.HARM_CATEGORY_CIVIC_INTEGRITY
  }
};

// src/utils/kv/deno-store.ts
class DenoKVStore {
  kv = null;
  constructor() {
    try {
      Deno.openKv?.().then((kv) => {
        this.kv = kv;
      }).catch((error) => {
        console.error("无法初始化Deno KV存储:", error);
      });
    } catch (error) {
      console.error("无法初始化Deno KV存储:", error);
    }
  }
  async get(key) {
    if (!this.kv)
      return null;
    try {
      const result = await this.kv.get([key]);
      return result?.value || null;
    } catch (error) {
      console.error(`Deno KV get错误 (${key}):`, error);
      return null;
    }
  }
  async set(key, value, options) {
    if (!this.kv)
      return;
    try {
      const opts = options?.expireIn ? { expireIn: options.expireIn } : undefined;
      await this.kv.set([key], value, opts);
    } catch (error) {
      console.error(`Deno KV set错误 (${key}):`, error);
    }
  }
  getType() {
    return "DenoKV";
  }
}

// src/utils/kv/memory-store.ts
class MemoryKVStore {
  store = new Map;
  expiryMap = new Map;
  cleanupInterval = null;
  constructor() {
    this.cleanupInterval = setInterval(this.cleanupExpiredItems.bind(this), 60000);
  }
  cleanupExpiredItems() {
    const now = Date.now();
    this.expiryMap.forEach((expiryTime, key) => {
      if (expiryTime < now) {
        this.store.delete(key);
        this.expiryMap.delete(key);
      }
    });
  }
  async get(key) {
    if (this.expiryMap.has(key)) {
      const expiryTime = this.expiryMap.get(key);
      if (expiryTime && expiryTime < Date.now()) {
        this.store.delete(key);
        this.expiryMap.delete(key);
        return null;
      }
    }
    return this.store.get(key);
  }
  async set(key, value, options) {
    this.store.set(key, value);
    if (options?.expireIn) {
      const expiryTime = Date.now() + options.expireIn;
      this.expiryMap.set(key, expiryTime);
    }
  }
  getType() {
    return "MemoryKV";
  }
}

// src/utils/kv/index.ts
function createKVStore() {
  try {
    if (typeof Deno !== "undefined" && Deno.openKv) {
      return new DenoKVStore;
    }
  } catch (e) {}
  return new MemoryKVStore;
}
var kvStore = createKVStore();

// src/utils/apikey.ts
var KV_PREFIX = config.keyManagement.kvPrefix;
var MODEL_ROTATION_KEY = `${KV_PREFIX}:model_rotations`;
var LAST_RESET_KEY = `${KV_PREFIX}:last_reset_time`;
var MODEL_USAGE_KEY = `${KV_PREFIX}:model_usages`;
var KEY_BLACKLIST_KEY = `${KV_PREFIX}:key_blacklist`;
var ROTATION_RESET_INTERVAL = config.keyManagement.rotationResetInterval;
var BLACKLIST_TIMEOUT = config.keyManagement.blacklistTimeout;
function parseApiKeys() {
  const apiKeyArray = config.api.GEMINI_API_KEY;
  if (!apiKeyArray) {
    throw new Error("GEMINI_API_KEY not set correctly");
  }
  return apiKeyArray.split(",").map((key) => key.trim()).filter(Boolean);
}
var geminiApiKeys = parseApiKeys();
async function getLastResetTime() {
  const lastReset = await kvStore.get(LAST_RESET_KEY);
  if (!lastReset) {
    const now = Date.now();
    await kvStore.set(LAST_RESET_KEY, now);
    return now;
  }
  return lastReset;
}
async function getModelRotations() {
  const rotations = await kvStore.get(MODEL_ROTATION_KEY);
  const lastReset = await getLastResetTime();
  const now = Date.now();
  const timeSinceReset = now - lastReset;
  if (timeSinceReset > ROTATION_RESET_INTERVAL) {
    await kvStore.set(LAST_RESET_KEY, now);
    await kvStore.set(MODEL_USAGE_KEY, {});
    return {};
  }
  return rotations || {};
}
async function saveModelRotation(model, index) {
  const rotations = await getModelRotations();
  rotations[model] = index;
  await kvStore.set(MODEL_ROTATION_KEY, rotations, { expireIn: ROTATION_RESET_INTERVAL });
}
async function getApiKeyUsage() {
  const usages = await kvStore.get(MODEL_USAGE_KEY);
  return usages || {};
}
async function recordApiKeyUsage(model, keyIndex) {
  const usages = await getApiKeyUsage();
  if (!usages[model]) {
    usages[model] = {};
  }
  const keyId = keyIndex.toString();
  usages[model][keyId] = (usages[model][keyId] || 0) + 1;
  await kvStore.set(MODEL_USAGE_KEY, usages, { expireIn: ROTATION_RESET_INTERVAL });
}
async function getBlacklist() {
  const blacklist = await kvStore.get(KEY_BLACKLIST_KEY);
  return blacklist || {};
}
async function blacklistApiKey(model, keyIndex) {
  const blacklist = await getBlacklist();
  if (!blacklist[model]) {
    blacklist[model] = {};
  }
  const keyId = keyIndex.toString();
  blacklist[model][keyId] = Date.now();
  await kvStore.set(KEY_BLACKLIST_KEY, blacklist, { expireIn: BLACKLIST_TIMEOUT });
  console.warn(`已将密钥 #${keyIndex} 加入 ${model} 模型的黑名单，将在 ${BLACKLIST_TIMEOUT / 60000} 分钟后恢复`);
}
async function getApiKey(model = undefined, retryCount = 0, options = { recordUsage: true }) {
  if (model === undefined) {
    return { key: geminiApiKeys[0] || "", index: 0 };
  }
  if (retryCount >= geminiApiKeys.length) {
    console.error(`所有密钥都已尝试，模型 ${model} 无可用密钥`);
    return { key: geminiApiKeys[0] || "", index: 0 };
  }
  const blacklist = await getBlacklist();
  const modelBlacklist = blacklist[model] || {};
  const now = Date.now();
  let hasExpiredItems = false;
  Object.entries(modelBlacklist).forEach(([keyId, timestamp]) => {
    if (now - timestamp > BLACKLIST_TIMEOUT) {
      delete modelBlacklist[keyId];
      hasExpiredItems = true;
    }
  });
  if (hasExpiredItems) {
    blacklist[model] = modelBlacklist;
    await kvStore.set(KEY_BLACKLIST_KEY, blacklist, { expireIn: BLACKLIST_TIMEOUT });
  }
  const usages = await getApiKeyUsage();
  const modelUsage = usages[model] || {};
  let leastUsedIndex = -1;
  let leastUsageCount = Infinity;
  for (let i = 0;i < geminiApiKeys.length; i++) {
    if (modelBlacklist[i.toString()]) {
      continue;
    }
    const usageCount = modelUsage[i.toString()] || 0;
    if (usageCount < leastUsageCount) {
      leastUsageCount = usageCount;
      leastUsedIndex = i;
    }
  }
  if (leastUsedIndex === -1) {
    const rotations = await getModelRotations();
    let currentIndex = rotations[model] || 0;
    currentIndex = currentIndex % geminiApiKeys.length;
    await saveModelRotation(model, currentIndex + 1);
    return { key: geminiApiKeys[currentIndex] || "", index: currentIndex };
  }
  if (options.recordUsage) {
    await recordApiKeyUsage(model, leastUsedIndex);
  }
  return { key: geminiApiKeys[leastUsedIndex] || "", index: leastUsedIndex };
}
async function withRetry(model, apiCallFn, options = {}) {
  const balancingOptions = {
    recordUsage: options.recordUsage ?? true,
    useBlacklist: options.useBlacklist ?? true,
    maxRetries: options.maxRetries ?? Math.min(config.keyManagement.defaultMaxRetries, geminiApiKeys.length)
  };
  let lastError = null;
  for (let retryCount = 0;retryCount < balancingOptions.maxRetries; retryCount++) {
    const { key, index } = await getApiKey(model, retryCount, {
      recordUsage: balancingOptions.recordUsage
    });
    try {
      return await apiCallFn(key);
    } catch (error) {
      console.error(`API调用失败 (模型: ${model}, 密钥索引: ${index}, 重试: ${retryCount + 1}/${balancingOptions.maxRetries}):`, error.message || error);
      if (balancingOptions.useBlacklist && isRetryableError(error)) {
        await blacklistApiKey(model, index);
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error(`所有API密钥都已尝试但请求失败 (模型: ${model})`);
}
async function withoutBalancing(apiCallFn) {
  const { key } = await getApiKey(undefined, 0, { recordUsage: false });
  try {
    return await apiCallFn(key);
  } catch (error) {
    console.error("非负载均衡API调用失败:", error);
    throw error;
  }
}
function isRetryableError(error) {
  const errorMessage = String(error.message || error).toLowerCase();
  if (errorMessage.includes("api key not valid") || errorMessage.includes("quota exceeded") || errorMessage.includes("rate limit") || errorMessage.includes("too many requests")) {
    return true;
  }
  if (error.status) {
    return error.status >= 500 && error.status < 600;
  }
  if (error.code) {
    return [
      "ECONNRESET",
      "ETIMEDOUT",
      "ECONNABORTED",
      "EHOSTUNREACH",
      "ENETUNREACH"
    ].includes(error.code);
  }
  return false;
}
async function getRotationStatus() {
  const lastResetTime = await getLastResetTime();
  const nextResetTime = lastResetTime + ROTATION_RESET_INTERVAL;
  const now = Date.now();
  const remainingTime = nextResetTime - now;
  const modelUsages = await getApiKeyUsage();
  const blacklist = await getBlacklist();
  const keys = [];
  const modelStats = [];
  const modelSet = new Set;
  Object.keys(modelUsages).forEach((model) => modelSet.add(model));
  for (let i = 0;i < geminiApiKeys.length; i++) {
    const keyIndex = i.toString();
    const keyStatus = isKeyBlacklisted(keyIndex, blacklist) ? "blacklisted" : "active";
    let totalUsage = 0;
    const byModel = {};
    modelSet.forEach((model) => {
      const usage = (modelUsages[model] || {})[keyIndex] || 0;
      byModel[model] = usage;
      totalUsage += usage;
    });
    const keyInfo = {
      index: i,
      status: keyStatus,
      usage: {
        total: totalUsage,
        byModel
      }
    };
    if (keyStatus === "blacklisted") {
      const blacklistedModels = [];
      let earliestExpiry = Infinity;
      Object.entries(blacklist).forEach(([model, keyMap]) => {
        if (keyMap && keyMap[keyIndex]) {
          blacklistedModels.push(model);
          const expiryTime = keyMap[keyIndex] + BLACKLIST_TIMEOUT;
          earliestExpiry = Math.min(earliestExpiry, expiryTime);
        }
      });
      keys.push({
        ...keyInfo,
        blacklistInfo: {
          models: blacklistedModels,
          expiresAt: earliestExpiry,
          remainingTime: Math.max(0, earliestExpiry - now)
        }
      });
    } else {
      keys.push(keyInfo);
    }
  }
  modelSet.forEach((model) => {
    const usage = modelUsages[model] || {};
    let totalRequests = 0;
    const keyDistribution = {};
    Object.entries(usage).forEach(([keyIndex, count]) => {
      totalRequests += count;
      keyDistribution[keyIndex] = count;
    });
    modelStats.push({
      name: model,
      totalRequests,
      keyDistribution
    });
  });
  const blacklistedKeys = keys.filter((k) => k.status === "blacklisted").length;
  return {
    summary: {
      totalKeys: geminiApiKeys.length,
      activeKeys: geminiApiKeys.length - blacklistedKeys,
      blacklistedKeys,
      resetIn: remainingTime,
      kvType: kvStore.getType()
    },
    modelStats,
    keys
  };
}
function isKeyBlacklisted(keyIndex, blacklist) {
  for (const model in blacklist) {
    const modelBlacklist = blacklist[model];
    if (modelBlacklist && modelBlacklist[keyIndex]) {
      return true;
    }
  }
  return false;
}

// src/utils/error.ts
import { APIError } from "npm:openai@4.92.1";
var ERROR_MESSAGES = {
  ["invalid_request_error" /* INVALID_REQUEST */]: "无效的请求",
  ["authentication_error" /* AUTHENTICATION */]: "认证失败",
  ["rate_limit_error" /* RATE_LIMIT */]: "请求频率超限",
  ["server_error" /* SERVER */]: "服务器内部错误",
  ["unknown_error" /* UNKNOWN */]: "未知错误"
};
function extractErrorInfo(error) {
  if (error instanceof APIError) {
    return {
      message: error.message,
      type: error.type || "unknown_error" /* UNKNOWN */,
      code: error.code || undefined,
      param: error.param || undefined
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      type: "unknown_error" /* UNKNOWN */,
      code: "error"
    };
  }
  if (typeof error === "object" && error !== null) {
    const err = error;
    const message = err.message || err.error?.message || ERROR_MESSAGES["unknown_error" /* UNKNOWN */];
    return {
      message: String(message),
      type: err.type || "unknown_error" /* UNKNOWN */,
      code: err.code,
      param: err.param
    };
  }
  return {
    message: ERROR_MESSAGES["unknown_error" /* UNKNOWN */],
    type: "unknown_error" /* UNKNOWN */
  };
}
function getErrorStatus(error) {
  if (error instanceof APIError) {
    return error.status || 500;
  }
  if (typeof error === "object" && error !== null) {
    const err = error;
    if (typeof err.status === "number") {
      return err.status;
    }
  }
  return 500;
}
function createErrorResponse(error) {
  const status = getErrorStatus(error);
  const errorInfo = extractErrorInfo(error);
  return {
    status,
    body: {
      error: errorInfo
    }
  };
}
function createHonoErrorResponse(c, error) {
  const { status, body } = createErrorResponse(error);
  return c.json(body, status);
}

// src/utils/middleware.ts
var AUTH_TOKEN = config.api.AUTH_TOKEN;
function createGeminiAuthMiddleware() {
  return async function(c, next) {
    const reqToken = c.req.header("x-goog-api-key") || c.req.query("key");
    if (!AUTH_TOKEN) {
      return c.json({ error: "AUTH_TOKEN not set correctly" }, 401);
    }
    if (AUTH_TOKEN !== reqToken) {
      return c.json({ error: "Invalid API key" }, 401);
    }
    await next();
  };
}
function createOpenAIAuthMiddleware() {
  return async function(c, next) {
    const token = c.req.header("authorization") || "";
    const reqToken = token.startsWith("Bearer ") ? token.split(" ")[1] : token;
    if (!AUTH_TOKEN) {
      return c.json({ error: "AUTH_TOKEN not set correctly" }, 401);
    }
    if (AUTH_TOKEN !== reqToken) {
      return c.json({ error: "Invalid API key" }, 401);
    }
    await next();
  };
}
var geminiAuthMiddleware = createGeminiAuthMiddleware();
var openaiAuthMiddleware = createOpenAIAuthMiddleware();

// src/utils/safety.ts
var VALID_HARM_THRESHOLDS = [
  "BLOCK_NONE",
  "BLOCK_ONLY_HIGH",
  "BLOCK_MEDIUM_AND_ABOVE",
  "BLOCK_LOW_AND_ABOVE",
  "HARM_BLOCK_THRESHOLD_UNSPECIFIED"
];
function getValidHarmSettings(requestSafetySettings) {
  if (!requestSafetySettings || !Array.isArray(requestSafetySettings)) {
    return Object.entries(config.safety).filter(([_, threshold]) => threshold && VALID_HARM_THRESHOLDS.includes(threshold)).map(([category, threshold]) => ({
      category,
      threshold
    }));
  }
  const envSettings = new Map(Object.entries(config.safety).filter(([_, threshold]) => threshold && VALID_HARM_THRESHOLDS.includes(threshold)).map(([category, threshold]) => [category, threshold]));
  return requestSafetySettings.map((setting) => {
    const envThreshold = envSettings.get(setting.category);
    return envThreshold ? { ...setting, threshold: envThreshold } : setting;
  });
}
function validateHarmCategories() {
  Object.entries(config.safety).filter(([_, value]) => value && !VALID_HARM_THRESHOLDS.includes(value)).forEach(([name, value]) => {
    console.error(`错误: ${name} 的值 "${value}" 无效。有效值为: ${VALID_HARM_THRESHOLDS.join(", ")}`);
  });
}

// src/utils/rebody.ts
var CONFIG_FIELDS = {
  safetySettings: true,
  systemInstruction: true,
  tools: true
};
function extractConfigFields(body) {
  return Object.fromEntries(Object.entries(body).filter(([key]) => (key in CONFIG_FIELDS)));
}
function validateRequestBody(body) {
  if (!body.contents) {
    throw new Error("请求体必须包含 contents 字段");
  }
}
function normalizeRequestBody(originalBody, modelName) {
  validateRequestBody(originalBody);
  if (originalBody.model && originalBody.contents && (originalBody.config || originalBody.config === null || originalBody.config === undefined)) {
    return originalBody;
  }
  const clonedBody = { ...originalBody };
  const extractedConfig = extractConfigFields(clonedBody);
  Object.keys(CONFIG_FIELDS).forEach((key) => {
    delete clonedBody[key];
  });
  const generationConfig = clonedBody.generationConfig;
  delete clonedBody.generationConfig;
  const existingSafetySettings = originalBody.config?.safetySettings || extractedConfig.safetySettings;
  const processedSafetySettings = getValidHarmSettings(existingSafetySettings);
  const finalConfig = {
    ...extractedConfig,
    ...originalBody.config || {},
    ...generationConfig || {},
    safetySettings: processedSafetySettings
  };
  return {
    model: modelName || originalBody.model || "",
    contents: originalBody.contents,
    config: finalConfig
  };
}

// src/api/gemini.ts
var genai = new Hono;
genai.use("/models/*", geminiAuthMiddleware);
genai.use("/openai/embeddings", openaiAuthMiddleware);
var actionHandlers = {
  generateContent: handleGenerateContent,
  streamGenerateContent: handleGenerateContentStream,
  embedContent: handleEmbedContent
};
async function handleGenerateContent(c, model, apiKey, originalBody) {
  const body = normalizeRequestBody(originalBody, model);
  try {
    const response = await withRetry(model, async (key) => {
      const ai = new GoogleGenAI({ apiKey: key });
      return await ai.models.generateContent({
        ...body
      });
    });
    return c.json(response);
  } catch (error) {
    console.error("Generate content error:", error);
    return createHonoErrorResponse(c, error);
  }
}
async function handleGenerateContentStream(c, model, apiKey, originalBody) {
  const body = normalizeRequestBody(originalBody, model);
  try {
    const result = await withRetry(model, async (key) => {
      const ai = new GoogleGenAI({ apiKey: key });
      return await ai.models.generateContentStream({
        ...body
      });
    });
    return streamSSE(c, async (stream) => {
      try {
        for await (const chunk of result) {
          await stream.writeSSE({
            data: JSON.stringify(chunk)
          });
        }
      } catch (e) {
        console.error("Streaming error:", e);
        const { body: body2 } = createErrorResponse(e);
        await stream.writeSSE({
          data: JSON.stringify(body2)
        });
      }
    });
  } catch (error) {
    console.error("Generate content stream error:", error);
    return createHonoErrorResponse(c, error);
  }
}
async function handleEmbedContent(c, model, apiKey, body) {
  const contents = body.content;
  try {
    const response = await withRetry(model, async (key) => {
      const ai = new GoogleGenAI({ apiKey: key });
      return await ai.models.embedContent({
        model,
        contents,
        config: {
          taskType: body.task_type,
          title: body.title,
          outputDimensionality: body.outputDimensionality
        }
      });
    });
    return c.json({
      embedding: response?.embeddings?.[0] || { values: [] }
    });
  } catch (error) {
    console.error("Embed content error:", error);
    return createHonoErrorResponse(c, error);
  }
}
genai.post("/models/:modelAction{.+:.+}", async (c) => {
  const modelAction = c.req.param("modelAction");
  const [model, action] = modelAction.split(":");
  if (!model || !action) {
    return createHonoErrorResponse(c, {
      message: "无效的请求路径格式，预期格式: /v1beta/models/{model}:{action}",
      type: "invalid_request_error",
      status: 400
    });
  }
  const handler = actionHandlers[action];
  if (!handler) {
    return createHonoErrorResponse(c, {
      message: `不支持的操作: ${action}`,
      type: "invalid_request_error",
      status: 400
    });
  }
  const body = await c.req.json();
  return handler(c, model, "", body);
});
genai.get("/models", async (c) => {
  try {
    const data = await withoutBalancing(async (key) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`获取模型列表失败: ${response.statusText}`);
      }
      return await response.json();
    });
    return c.json(data);
  } catch (error) {
    console.error("获取模型列表错误:", error);
    return createHonoErrorResponse(c, error);
  }
});
genai.get("/models/:model", async (c) => {
  const model = c.req.param("model");
  try {
    const data = await withoutBalancing(async (key) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${key}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`获取模型信息失败: ${response.statusText}`);
      }
      return await response.json();
    });
    return c.json(data);
  } catch (error) {
    console.error(`获取模型 ${model} 信息错误:`, error);
    return createHonoErrorResponse(c, error);
  }
});
genai.post("/openai/embeddings", async (c) => {
  const body = await c.req.json();
  const { model, input, encoding_format, dimensions } = body;
  if (!model || !input) {
    return createHonoErrorResponse(c, {
      message: "请求体必须包含 'model' 和 'input' 参数。",
      type: "invalid_request_error",
      status: 400
    });
  }
  try {
    const embeddingResponse = await withRetry(model, async (key) => {
      const openai = new OpenAI({
        apiKey: key,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
      });
      return await openai.embeddings.create({
        model,
        input,
        ...encoding_format && { encoding_format },
        ...dimensions && { dimensions }
      });
    });
    return c.json(embeddingResponse);
  } catch (error) {
    console.error("创建 Embeddings 时出错:", error);
    return createHonoErrorResponse(c, error);
  }
});
var gemini_default = genai;

// src/api/openai.ts
import { Hono as Hono2 } from "npm:hono@4.7.5";
import { streamSSE as streamSSE2 } from "npm:hono@4.7.5/streaming";
import OpenAI2 from "npm:openai@4.92.1";
var oai = new Hono2;
oai.use("/*", openaiAuthMiddleware);
var baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
oai.post("/chat/completions", async (c) => {
  const { messages, model, tools, tool_choice, stream = false } = await c.req.json();
  try {
    if (stream) {
      return streamSSE2(c, async (stream2) => {
        try {
          const completion = await withRetry(model, async (key) => {
            const openai = new OpenAI2({
              apiKey: key,
              baseURL
            });
            return await openai.chat.completions.create({
              model,
              messages,
              tools,
              tool_choice,
              stream: true
            });
          });
          for await (const chunk of completion) {
            await stream2.writeSSE({
              data: JSON.stringify(chunk)
            });
          }
          await stream2.writeSSE({ data: "[DONE]" });
        } catch (error) {
          console.error("流式处理错误:", error);
          const { body } = createErrorResponse(error);
          await stream2.writeSSE({
            data: JSON.stringify(body)
          });
        }
      });
    }
    const response = await withRetry(model, async (key) => {
      const openai = new OpenAI2({
        apiKey: key,
        baseURL
      });
      return await openai.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice
      });
    });
    return c.json(response);
  } catch (error) {
    console.error("API调用错误:", error);
    return createHonoErrorResponse(c, error);
  }
});
oai.get("/models", async (c) => {
  try {
    const models = await withoutBalancing(async (key) => {
      const openai = new OpenAI2({
        apiKey: key,
        baseURL
      });
      return await openai.models.list();
    });
    return c.json({
      object: "list",
      data: models.data
    });
  } catch (error) {
    console.error("获取模型错误:", error);
    return createHonoErrorResponse(c, error);
  }
});
oai.get("/models/:model", async (c) => {
  const { model: modelId } = c.req.param();
  try {
    const model = await withoutBalancing(async (key) => {
      const openai = new OpenAI2({
        apiKey: key,
        baseURL
      });
      return await openai.models.retrieve(modelId);
    });
    return c.json(model);
  } catch (error) {
    console.error("检索模型错误:", error);
    return createHonoErrorResponse(c, error);
  }
});
oai.post("/embeddings", async (c) => {
  const { model, input, encoding_format, dimensions } = await c.req.json();
  if (!model || !input) {
    return createHonoErrorResponse(c, {
      message: "请求体必须包含 'model' 和 'input' 参数。",
      type: "invalid_request_error",
      status: 400
    });
  }
  try {
    const embeddingResponse = await withRetry(model, async (key) => {
      const openai = new OpenAI2({
        apiKey: key,
        baseURL
      });
      return await openai.embeddings.create({
        model,
        input,
        ...encoding_format && { encoding_format },
        ...dimensions && { dimensions }
      });
    });
    return c.json(embeddingResponse);
  } catch (error) {
    console.error("创建 Embeddings 时出错:", error);
    return createHonoErrorResponse(c, error);
  }
});
var openai_default = oai;

// src/index.ts
console.log(`
=== Gemini Party v${config.version} 启动中... ===
`);
var app = new Hono3;
validateHarmCategories();
var API_PREFIX = config.api.API_PREFIX ?? "";
app.route(API_PREFIX + "/v1", openai_default);
app.route(API_PREFIX + "/v1beta", gemini_default);
app.get(API_PREFIX + "/rotation-status", async (c) => {
  try {
    const status = await getRotationStatus();
    return c.json({
      status: "success",
      version: config.version,
      data: status
    });
  } catch (error) {
    console.error("获取轮询状态出错:", error);
    return createHonoErrorResponse(c, {
      message: "获取轮询状态时发生错误",
      type: "internal_server_error",
      status: 500
    });
  }
});
app.get("/robots.txt", async (c) => {
  return c.text(`User-agent: *
Disallow: /`);
});
var src_default = app;
export {
  src_default as default
};
