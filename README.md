# Gemini Party

Gemini Party 是一个基于 [Hono](https://github.com/honojs/hono) 的轻量级 Gemini API 代理服务，支持轮询负载均衡
，同时支持 Gemini API 格式和 OpenAI 兼容格式的 API 调用。

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

对于 OpenAI 格式的请求使用 `OpenAI SDK`，但是Google对于OpenAI格式的支持仍处于Beta阶段，所有有些功能无法实现，比如 Safety
settings 和 Gemini 2.0 Flash 的图文生成，

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

## ⚙️ 环境变量

所有配置选项在 `.env` 文件中设置:

| 参数                      | 描述                                                                     | 必填 | 示例                 |
| ------------------------- | ------------------------------------------------------------------------ | ---- | -------------------- |
| `GEMINI_API_KEY`          | Gemini API 密钥，多个密钥用逗号分隔                                      | 是   | `key1,key2,key3`     |
| `AUTH_TOKEN`              | 访问认证令牌，可设置多个，逗号分隔                                       | 是   | `sk-test-1234567890` |
| `API_PREFIX`              | API 路径前缀，用于反向代理场景                                           | 否   | `hf`                 |
| `HARM_CATEGORY_*`         | [Safety settings](https://ai.google.dev/gemini-api/docs/safety-settings) | 否   | `BLOCK_NONE`         |
| `ROTATION_RESET_INTERVAL` | 轮询重置间隔(毫秒)                                                       | 否   | `60000`              |
| `BLACKLIST_TIMEOUT`       | 黑名单超时时间(毫秒)                                                     | 否   | `300000`             |
| `DEFAULT_MAX_RETRIES`     | 最大重试次数                                                             | 否   | `3`                  |

<p style="font-size:.92rem">* OpenAI 兼容格式不支持 <code>HARM_CATEGORY_*</code> 相关设置</p>

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

## 📋 项目结构

```
gemini-party/
├── src/
│   ├── api/
│   │   ├── gemini.ts     # Gemini 原生格式接口实现
│   │   └── openai.ts     # OpenAI 兼容格式接口实现
│   ├── utils/
│   │   ├── apikey.ts     # API密钥与轮询
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
