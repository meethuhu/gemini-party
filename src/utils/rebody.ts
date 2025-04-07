import type { GenerateContentParameters, GenerateContentConfig } from '@google/genai';
import { getValidHarmSettings } from './safety';

/**
 * 规范化请求体为Google GenAI API所需格式
 *
 * @param originalBody 原始请求体
 * @param modelName 模型名称(可选)
 * @returns 规范化的请求参数
 */
export default function normalizeRequestBody(
  originalBody: Record<string, any>,
  modelName: string
): GenerateContentParameters {
  // 已符合规格的请求直接返回
  if (
    originalBody.model &&
    originalBody.contents &&
    (originalBody.config || originalBody.config === null || originalBody.config === undefined)
  ) {
    return originalBody as GenerateContentParameters;
  }

  // 配置字段列表
  const configFields: (keyof GenerateContentConfig)[] = [
    'audioTimestamp',
    'cachedContent',
    'candidateCount',
    'frequencyPenalty',
    'httpOptions',
    'labels',
    'logprobs',
    'maxOutputTokens',
    'mediaResolution',
    'presencePenalty',
    'responseLogprobs',
    'responseMimeType',
    'responseModalities',
    'responseSchema',
    'routingConfig',
    'safetySettings',
    'seed',
    'speechConfig',
    'stopSequences',
    'systemInstruction',
    'temperature',
    'thinkingConfig',
    'toolConfig',
    'tools',
    'topK',
    'topP',
  ];

  // 提取配置并移除顶级字段
  const extractedConfig: Partial<GenerateContentConfig> = {};
  const clonedBody = { ...originalBody };

  for (const field of configFields) {
    if (field in clonedBody) {
      extractedConfig[field] = clonedBody[field];
      delete clonedBody[field];
    }
  }

  // 处理安全设置
  const existingSafetySettings =
    originalBody.config?.safetySettings || extractedConfig.safetySettings;
  const processedSafetySettings = getValidHarmSettings(existingSafetySettings);

  // 合并现有config与提取的config
  const finalConfig: GenerateContentConfig = {
    ...extractedConfig,
    ...(originalBody.config || {}),
    // 应用处理后的安全设置
    safetySettings: processedSafetySettings,
  };

  // 构建标准请求体
  return {
    model: modelName || originalBody.model,
    contents: originalBody.contents,
    config: finalConfig,
  };
}
