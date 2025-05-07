# Gemini Party

Gemini Party 是一个高效、可靠的 Gemini API 代理服务，基于 [Hono](https://github.com/honojs/hono) 构建。它提供智能的 API 密钥轮询负载均衡、自动错误重试和黑名单机制，支持 Gemini 原生 API 和 OpenAI 兼容格式调用，帮助您高效管理和使用多个 Gemini API 密钥。

## ✨ 核心特性

- **智能负载均衡**: 自动在多个 API 密钥之间进行智能轮询
- **自动重试机制**: 当 API 不可用时自动重试并暂时加入黑名单
- **双格式支持**: 同时兼容 Gemini API 原生格式和 OpenAI 兼容格式
- **密钥监控**: 提供实时 API 密钥使用状态监控和统计
- **轻量高效**: 基于 Hono 构建，性能卓越，资源占用低
- **简单部署**: 支持 Docker、Deno Deploy 等多种部署方式

## 💻 支持平台

- Docker
- Deno Deploy

## 📚 接口说明

### <img src="public/gemini.svg" alt="gemini-icon" width="20" style="transform: translateY(.3rem)"> Gemini 原生格式

- `POST /v1beta/models/{model}:generateContent` - 生成内容
- `POST /v1beta/models/{model}:streamGenerateContent` - 流式生成内容
- `POST /v1beta/models/{model}:embedContent` - 创建文本嵌入
- `POST /v1beta/openai/embeddings` - OpenAI 格式的文本嵌入
- `GET  /v1beta/models` - 获取模型列表
- `GET  /v1beta/models/{model}` - 获取特定模型信息

### <img src="public/openai.svg" alt="openai-icon" width="20" style="transform: translateY(.3rem)"> OpenAI 兼容格式

对于 OpenAI 格式的请求使用 `OpenAI SDK`，但是 Google 对于 OpenAI 格式的支持仍处于 Beta 阶段，部分功能受限，例如 Safety settings 和 Gemini 2.0 Flash 的图文生成等。

- `POST /v1/chat/completions` - 创建聊天补全
- `POST /v1/embeddings` - 创建文本嵌入
- `GET  /v1/models` - 获取模型列表
- `GET  /v1/models/{model}` - 获取特定模型信息

### 🛠️ 系统端点

- `GET /rotation-status` - 获取 API 密钥轮询状态信息，包括每个密钥的使用情况和状态

## 🚀 安装与部署

### 使用 Bun

```bash
# 克隆仓库
git clone https://github.com/yourusername/gemini-pool.git
cd gemini-party

# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，添加你的 API 密钥和其他配置

# 启动服务
bun start
```

### 使用 Docker

```bash
# 拉取镜像
docker pull ghcr.io/meethuhu/gemini-party:latest

# 运行容器
docker run -d -p 2333:3000 --env-file .env --name gemini-party ghcr.io/meethuhu/gemini-party:latest
```

### 使用 Docker Compose

```bash
# 启动服务
docker-compose up -d
```

### 使用 Deno Deploy 部署

1. 复制 [`/serverless/deno.js`](serverless/deno.js) 文件内容
2. 前往 [`deno.dev`](https://deno.dev) 使用 `New Playground` 功能

## ⚙️ 环境变量

所有配置选项在 `.env` 文件中设置:

| 参数                      | 描述                                                                     | 必填 | 示例                 |
| ------------------------- | ------------------------------------------------------------------------ | ---- | -------------------- |
| `GEMINI_API_KEY`          | Gemini API 密钥，多个密钥用逗号分隔                                      | 是   | `key1,key2,key3`     |
| `AUTH_TOKEN`              | 访问认证令牌                                                             | 是   | `sk-test-1234567890` |
| `API_PREFIX`              | API 路径前缀，用于反向代理场景                                           | 否   | `hf`                 |
| `HARM_CATEGORY_*`         | [Safety settings](https://ai.google.dev/gemini-api/docs/safety-settings) | 否   | `BLOCK_NONE`         |
| `ROTATION_RESET_INTERVAL` | 轮询重置间隔(毫秒)                                                       | 否   | `60000`              |
| `BLACKLIST_TIMEOUT`       | 黑名单超时时间(毫秒)                                                     | 否   | `300000`             |
| `DEFAULT_MAX_RETRIES`     | 最大重试次数                                                             | 否   | `3`                  |
| `KEY_SELECTION_STRATEGY`  | 负载均衡策略                                                             | 否   | `RANDOM`             |
|`GEMINI_API_ENDPOINT`|自定义Gemini端点（必须添加API版本）|否|`https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/google-ai-studio/v1beta`|
<p style="font-size:.92rem">* OpenAI 兼容格式不支持 <code>HARM_CATEGORY_*</code> 相关设置</p>

### Cloudflare AI Gateway 自定义模型成本

如果您通过 Cloudflare AI Gateway 路由请求 (即 `GEMINI_API_ENDPOINT` 或 `GEMINI_OPENAI_COMPAT_ENDPOINT` 指向 `gateway.ai.cloudflare.com`), 您可以为每个模型设置自定义成本。这允许 Gemini Party 在记录和分析时使用您与模型提供商协商的特定价格。

要配置自定义成本，请在您的 `.env` 文件中为每个相关模型添加以下格式的环境变量：

*   `MODEL_<MODEL_NAME>_COST_IN`: 每输入 token 的成本。
*   `MODEL_<MODEL_NAME>_COST_OUT`: 每输出 token 的成本。

将 `<MODEL_NAME>` 替换为实际的模型名称 (例如 `GEMINI-PRO`, `GEMINI-1.5-FLASH-LATEST`, 等)。模型名称将被转换为大写，并且所有非字母数字字符（下划线除外）都将替换为下划线。

**示例:**

```env
GEMINI_API_ENDPOINT="https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY_ID/google-ai-studio/v1beta"

# gemini-pro 模型的自定义成本
MODEL_GEMINI_PRO_COST_IN="0.000001"
MODEL_GEMINI_PRO_COST_OUT="0.000002"

# gemini-1.5-flash-latest 模型的自定义成本 (注意模型名称中的 '-' 被替换为 '_'，并且所有非字母数字字符（下划线除外）都将替换为下划线)
MODEL_GEMINI_1_5_FLASH_LATEST_COST_IN="0.0000005"
MODEL_GEMINI_1_5_FLASH_LATEST_COST_OUT="0.0000015"
```

如果为特定模型设置了这些变量，并且请求通过 Cloudflare AI Gateway，Gemini Party 将自动在请求中添加 `cf-aig-custom-cost` header。

## 💡 使用示例

### 使用 Gemini 原生格式

```bash
# 基本文本生成
curl -X POST "http://localhost:2333/v1beta/models/gemini-2.0-flash-lite:generateContent" \
  -H "x-goog-api-key: sk-test-1234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{ "text": "Hi" }]
      }
    ]
  }'

```

```bash
# 流式输出
curl -X POST "http://localhost:2333/v1beta/models/gemini-2.0-flash-lite:streamGenerateContent" \
  -H "x-goog-api-key: sk-test-1234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{ "text": "Who are you?" }]
      }
    ]
  }'
```

```bash
# 获取文本嵌入
curl -X POST "http://localhost:2333/v1beta/models/embedding-001:embedContent" \
  -H "x-goog-api-key: sk-test-1234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      { "parts": [{ "text": "Hello world" }] }
    ]
  }'
```

### 使用 OpenAI 兼容格式

```bash
# 聊天补全
curl -X POST "http://localhost:2333/v1/chat/completions" \
  -H "Authorization: Bearer sk-test-1234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash-lite",
    "messages": [
      { "role": "user", "content": "Hi" }
    ]
  }'
```

```bash
# 流式聊天补全
curl -X POST "http://localhost:2333/v1/chat/completions" \
  -H "Authorization: Bearer sk-test-1234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash-lite",
    "messages": [
      { "role": "user", "content": "Who are you?" }
    ],
    "stream": true
  }'
```

```bash
# 文本嵌入
curl -X POST "http://localhost:2333/v1/embeddings" \
  -H "Authorization: Bearer sk-test-1234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "embedding-001",
    "input": "Hello world"
  }'
```

### 获取负载均衡状态

```bash
# 查看API密钥使用情况和负载状态
curl "http://localhost:2333/rotation-status" \
  -H "Authorization: Bearer sk-test-1234567890"
```

## 📋 项目结构

```
gemini-party/
├── src/
│   ├── api/
│   │   ├── gemini.ts     # Gemini 原生格式接口实现
│   │   └── openai.ts     # OpenAI 兼容格式接口实现
│   ├── utils/
│   │   ├── apikey.ts     # API密钥轮询与负载均衡
│   │   ├── config.ts     # 配置管理
│   │   ├── error.ts      # 错误处理
│   │   ├── middleware.ts # 认证中间件
│   │   ├── rebody.ts     # 请求体格式化
│   │   └── safety.ts     # 安全设置
│   └── index.ts          # 应用入口
├── serverless/           # 无服务器部署
│   └── deno.js           # Deno Deploy
├── public/               # 静态资源
├── script/               # 构建时用的脚本
├── .env.example          # 环境变量示例
├── docker-compose.yaml   # Docker Compose配置
├── package.json
└── README.md
```

## 📄 开源许可

[MIT LICENSE](/LICENSE)
