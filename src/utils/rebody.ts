import type { GenerateContentConfig, GenerateContentParameters, ContentListUnion } from "@google/genai";
import { getValidHarmSettings } from "./safety";

// 配置字段定义
const CONFIG_FIELDS = {
    safetySettings: true,
    systemInstruction: true,
    tools: true
} as const;

type ConfigField = keyof typeof CONFIG_FIELDS;

/**
 * 从请求体中提取配置字段
 */
function extractConfigFields(body: Record<string, unknown>): Partial<GenerateContentConfig> {
    return Object.fromEntries(
        Object.entries(body)
            .filter(([key]) => key in CONFIG_FIELDS)
    ) as Partial<GenerateContentConfig>;
}

/**
 * 验证请求体是否包含必要字段
 */
function validateRequestBody(body: Record<string, unknown>): void {
    if (!body.contents) {
        throw new Error('请求体必须包含 contents 字段');
    }
}

/**
 * 规范化请求体为Google GenAI API所需格式
 *
 * @param originalBody 原始请求体
 * @param modelName 模型名称(可选)
 * @returns 规范化的请求参数
 * @throws 如果请求体缺少必要字段
 */
export default function normalizeRequestBody(
    originalBody: Partial<GenerateContentParameters> & Record<string, unknown>,
    modelName: string
): GenerateContentParameters {
    validateRequestBody(originalBody);

    // 已符合规格的请求直接返回
    if (originalBody.model && originalBody.contents && (originalBody.config || originalBody.config === null || originalBody.config === undefined)) {
        return originalBody as GenerateContentParameters;
    }

    // 克隆请求体以避免修改原始对象
    const clonedBody = { ...originalBody };

    // 提取配置字段
    const extractedConfig = extractConfigFields(clonedBody);
    
    // 移除已提取的配置字段
    Object.keys(CONFIG_FIELDS).forEach(key => {
        delete clonedBody[key];
    });

    // 提取并移除 generationConfig
    const generationConfig = clonedBody.generationConfig;
    delete clonedBody.generationConfig;

    // 处理安全设置
    const existingSafetySettings = originalBody.config?.safetySettings || extractedConfig.safetySettings;
    const processedSafetySettings = getValidHarmSettings(existingSafetySettings);

    // 合并配置
    const finalConfig: GenerateContentConfig = {
        ...extractedConfig,
        ...(originalBody.config || {}),
        ...(generationConfig || {}),
        safetySettings: processedSafetySettings,
    };

    // 构建标准结构
    return {
        model: modelName || originalBody.model || '',
        contents: originalBody.contents as ContentListUnion,
        config: finalConfig,
    };
}
