# Gemini API 图像生成功能

本文档介绍如何使用 Gemini API 代理服务进行图像生成和编辑。

## 功能概述

Gemini 2.0 Flash Exp 模型支持以下图像功能：
1. 文本到图像生成 - 从文本描述生成图像
2. 图像编辑 - 上传图像并基于提示词对其进行修改

这些功能通过设置 `responseModalities` 参数来指定响应包含图像。

## 接口使用

### 非流式图像生成/编辑接口

```
POST /v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent
```

### 流式图像生成/编辑接口

```
POST /v1beta/models/gemini-2.0-flash-exp-image-generation:streamGenerateContent
```

## 请求参数

### 纯文本生成图像

在请求体中，添加 `responseModalities` 字段，指定需要的响应类型为文本和图像：

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "画一只可爱的小猫"
        }
      ]
    }
  ],
  "responseModalities": ["Text", "Image"]
}
```

### 图像编辑

要编辑已有的图像，在请求中需要包含图像数据（Base64编码）：

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "在这张图片旁边添加一只羊驼"
        },
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "BASE64_ENCODED_IMAGE_DATA..."
          }
        }
      ]
    }
  ],
  "responseModalities": ["Text", "Image"]
}
```

## 响应格式

响应中，如果包含图像，将会在 `candidates[0].content.parts` 数组中包含 `inlineData` 类型的部分，其中包含 Base64 编码的图像数据：

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "这是关于图像的描述..."
          },
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "BASE64_ENCODED_IMAGE_DATA..."
            }
          }
        ]
      }
    }
  ]
}
```

## 代码示例

### 浏览器环境

参见 `examples/generate-image.js` 文件，展示了如何在浏览器环境中调用API生成图像。

### Node.js 图像生成

参见 `examples/generate-image-node.js` 文件，展示了如何在Node.js环境中调用API并保存生成的图像。

### Node.js 图像编辑

参见 `examples/edit-image-node.js` 文件，展示了如何上传图片并让模型进行编辑。

## 使用命令行工具

### 生成图像

```bash
curl -X POST http://localhost:3000/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "画一只在宇宙中漂浮的猫咪宇航员"
          }
        ]
      }
    ],
    "responseModalities": ["Text", "Image"]
  }' > response.json
```

### 编辑图像

请先将图像编码为Base64格式，然后在请求中包含这些数据：

```bash
# 将图像编码为Base64
BASE64_IMAGE=$(base64 -w 0 input-image.png)

curl -X POST http://localhost:3000/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "在这张图片旁边添加一只羊驼"
          },
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "'$BASE64_IMAGE'"
            }
          }
        ]
      }
    ],
    "responseModalities": ["Text", "Image"]
  }' > response.json
```

然后可以从 response.json 中提取 Base64 图像数据并转换为图像文件。

## 常见问题排查

### 503 Service Unavailable 错误

如果在发送请求后收到 503 错误，可能是因为：

1. 模型暂时不可用或过载
2. 请求格式不正确（特别是图像部分）
3. 图像太大或格式不受支持

建议尝试以下解决方案：
- 降低图像分辨率（最佳为1024x1024或更小）
- 转换图像为PNG或JPEG格式
- 稍后重试请求
- 检查API密钥权限是否包含图像生成能力 