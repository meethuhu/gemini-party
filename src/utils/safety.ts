import type { SafetySetting } from '@google/genai';

// 内容过滤器 - 从环境变量读取配置
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

/**
 * 获取有效的安全设置
 * 优先使用环境变量中的设置，如果环境变量未设置，则保留请求中的原有设置
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

    // 如果请求中没有安全设置，直接处理环境变量设置
    if (!requestSafetySettings || !Array.isArray(requestSafetySettings)) {
        const safetySettings: SafetySetting[] = [];
        Object.entries(envSafetySettings).forEach(([category, threshold]) => {
            if (threshold && VALID_HARM_THRESHOLDS.includes(threshold)) {
                safetySettings.push({ category, threshold } as SafetySetting);
            }
        });
        return safetySettings;
    }
    
    // 复制请求中的所有安全设置
    const finalSettings = [...requestSafetySettings];
    
    // 环境变量中有设置的类别，替换或添加到最终设置中
    Object.entries(envSafetySettings).forEach(([category, threshold]) => {
        if (threshold && VALID_HARM_THRESHOLDS.includes(threshold)) {
            // 查找请求中是否已有此类别
            const existingIndex = finalSettings.findIndex(s => s.category === category);
            if (existingIndex >= 0) {
                // 替换请求中的设置
                finalSettings[existingIndex] = { category, threshold } as SafetySetting;
            } else {
                // 添加新的设置
                finalSettings.push({ category, threshold } as SafetySetting);
            }
        }
    });
    
    return finalSettings;
}

/**
 * 验证环境变量中的有害内容类别配置是否有效
 * 输出错误信息但不中断程序执行
 */
export default function validateHarmCategories(): void {
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
