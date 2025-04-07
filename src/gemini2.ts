import type {
  GenerateContentParameters, //
  GenerateContentConfig, // config的定义
  ContentListUnion, // contents的定义
} from '@google/genai';

function createNewBody(body: Record<string, any>, model: string): GenerateContentParameters {
  // 符合规则无需转换
  if (body.model && body.contents && (body.config || typeof body.config === 'object')) {
    return body as GenerateContentParameters;
  }

  const contents: ContentListUnion = body.contents;
  let config: GenerateContentConfig = {};

  // 获取转换后的请求体
  const transformedBody = getNewConfig(body);
  // 使用转换后的config（包含了从顶级字段移过来的配置）
  config = transformedBody.config;
  // 如果原始请求中已有config，合并它们（保留原config中的值）
  if (body.config) {
    config = { ...config, ...body.config };
  }
  const newBody = {
    model,
    contents,
    config,
  };

  return newBody;
}

/**
 * 将顶级配置字段整合到config对象中
 * @param request 包含config信息的请求
 * @returns 配置字段已移至config对象的请求
 */
function getNewConfig<T extends Record<string, any>>(
  body: T
): Omit<T, keyof GenerateContentConfig> & { config: GenerateContentConfig } {
  // 创建原始请求对象的副本
  const newConfig: any = { ...body };

  // 初始化config对象
  const configFields: Partial<GenerateContentConfig> = {};

  // 需要移动到config对象中的字段列表
  const fieldsToMove: Array<keyof GenerateContentConfig> = [
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

  // 将字段从顶级移动到config对象
  for (const field of fieldsToMove) {
    if (field in body) {
      configFields[field] = body[field];
      delete newConfig[field];
    }
  }

  // 将config对象添加到请求中
  newConfig.config = configFields;

  return newConfig;
}
