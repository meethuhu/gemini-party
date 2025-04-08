import type {HarmBlockThreshold, HarmCategory, SafetySetting} from '@google/genai';
import {config} from './config';

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
 */
export function getValidHarmSettings(requestSafetySettings: SafetySetting[] | undefined): SafetySetting[] {
    // 如果请求中没有安全设置，直接处理环境变量设置
    if (!requestSafetySettings || !Array.isArray(requestSafetySettings)) {
        return Object.entries(config.safety)
            .filter(([_, threshold]) => threshold && VALID_HARM_THRESHOLDS.includes(threshold))
            .map(([category, threshold]) => ({
                category: category as HarmCategory,
                threshold: threshold as HarmBlockThreshold
            }));
    }

    // 创建环境变量设置的映射，便于快速查找
    const envSettings = new Map(
        Object.entries(config.safety)
            .filter(([_, threshold]) => threshold && VALID_HARM_THRESHOLDS.includes(threshold))
            .map(([category, threshold]) => [category, threshold as HarmBlockThreshold])
    );

    // 合并请求设置和环境变量设置
    return requestSafetySettings.map(setting => {
        const envThreshold = envSettings.get(setting.category as string);
        return envThreshold ? { ...setting, threshold: envThreshold } : setting;
    });
}

/**
 * 验证环境变量中的有害内容类别配置是否有效
 */
export default function validateHarmCategories(): void {
    Object.entries(config.safety)
        .filter(([_, value]) => value && !VALID_HARM_THRESHOLDS.includes(value))
        .forEach(([name, value]) => {
            console.error(`错误: ${name} 的值 "${value}" 无效。有效值为: ${VALID_HARM_THRESHOLDS.join(', ')}`);
        });
}
