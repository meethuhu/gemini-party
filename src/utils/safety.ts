// 内容过滤器 
const HARM_CATEGORY_HARASSMENT = process.env.HARM_CATEGORY_HARASSMENT || undefined;
const HARM_CATEGORY_DANGEROUS_CONTENT = process.env.HARM_CATEGORY_DANGEROUS_CONTENT || undefined;
const HARM_CATEGORY_SEXUALLY_EXPLICIT = process.env.HARM_CATEGORY_SEXUALLY_EXPLICIT || undefined;
const HARM_CATEGORY_HATE_SPEECH = process.env.HARM_CATEGORY_HATE_SPEECH || undefined;
const HARM_CATEGORY_CIVIC_INTEGRITY = process.env.HARM_CATEGORY_CIVIC_INTEGRITY || undefined;

// 验证内容过滤器设置
const VALID_HARM_THRESHOLDS: string[] = [
    'BLOCK_NONE',
    'BLOCK_ONLY_HIGH',
    'BLOCK_MEDIUM_AND_ABOVE',
    'BLOCK_LOW_AND_ABOVE',
    'HARM_BLOCK_THRESHOLD_UNSPECIFIED'
];

// 安全设置的类型定义
interface SafetySetting {
    category: string;
    threshold: string | undefined;
}

/**
 * 获取有效的安全设置
 * 优先使用环境变量中的设置，如果环境变量未设置，则保留请求中的原有设置
 * Author：Copilot Claude-3.7-Sonnet-Thinking
 * 
 * @param requestSafetySettings - 请求体中的安全设置
 * @returns 有效的安全设置数组
 */
export function getValidHarmSettings(requestSafetySettings: SafetySetting[] | undefined): SafetySetting[] {
    // 环境变量中的安全设置
    const envSafetySettings: Record<string, string | undefined> = {
        "HARM_CATEGORY_HATE_SPEECH": HARM_CATEGORY_HATE_SPEECH,
        "HARM_CATEGORY_SEXUALLY_EXPLICIT": HARM_CATEGORY_SEXUALLY_EXPLICIT,
        "HARM_CATEGORY_HARASSMENT": HARM_CATEGORY_HARASSMENT,
        "HARM_CATEGORY_DANGEROUS_CONTENT": HARM_CATEGORY_DANGEROUS_CONTENT,
        "HARM_CATEGORY_CIVIC_INTEGRITY": HARM_CATEGORY_CIVIC_INTEGRITY
    };

    // 创建一个映射以便快速查找请求中的设置
    const requestSettingsMap = new Map<string, string>();
    if (requestSafetySettings && Array.isArray(requestSafetySettings)) {
        requestSafetySettings.forEach(setting => {
            if (setting.category && setting.threshold) {
                requestSettingsMap.set(setting.category, setting.threshold);
            }
        });
    }

    // 创建最终的安全设置数组
    const safetySettings: SafetySetting[] = [];

    // 处理每个安全类别
    Object.entries(envSafetySettings).forEach(([category, envThreshold]) => {
        // 如果环境变量中设置了该类别的阈值
        if (envThreshold) {
            // 验证阈值是否有效
            if (VALID_HARM_THRESHOLDS.includes(envThreshold)) {
                safetySettings.push({ category, threshold: envThreshold });
            }
        }
        // 如果环境变量中未设置该类别的阈值，但请求中有设置
        else if (requestSettingsMap.has(category)) {
            const requestThreshold = requestSettingsMap.get(category);
            // 验证请求中的阈值是否有效
            if (requestThreshold && VALID_HARM_THRESHOLDS.includes(requestThreshold)) {
                safetySettings.push({ category, threshold: requestThreshold });
            }
        }
    });

    return safetySettings;
}

export default function validateHarmCategories() {
    const harmCategories = {
        HARM_CATEGORY_HARASSMENT,
        HARM_CATEGORY_DANGEROUS_CONTENT,
        HARM_CATEGORY_SEXUALLY_EXPLICIT,
        HARM_CATEGORY_HATE_SPEECH,
        HARM_CATEGORY_CIVIC_INTEGRITY
    };

    // 过滤出所有有值且无效的配置项，然后统一处理
    Object.entries(harmCategories)
        .filter(([_, value]) => value && !VALID_HARM_THRESHOLDS.includes(value))
        .forEach(([name, value]) => {
            console.error(`错误: ${name} 的值 "${value}" 无效。有效值为: ${VALID_HARM_THRESHOLDS.join(', ')}`);
        });
}