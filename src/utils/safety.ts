// 内容过滤器 
const HARM_CATEGORY_HARASSMENT = process.env.HARM_CATEGORY_HARASSMENT || undefined
const HARM_CATEGORY_DANGEROUS_CONTENT = process.env.HARM_CATEGORY_DANGEROUS_CONTENT || undefined
const HARM_CATEGORY_SEXUALLY_EXPLICIT = process.env.HARM_CATEGORY_SEXUALLY_EXPLICIT || undefined
const HARM_CATEGORY_HATE_SPEECH = process.env.HARM_CATEGORY_HATE_SPEECH || undefined
const HARM_CATEGORY_CIVIC_INTEGRITY = process.env.HARM_CATEGORY_CIVIC_INTEGRITY || undefined

// 验证内容过滤器设置
const VALID_HARM_THRESHOLDS: string[] = [
    'BLOCK_NONE',
    'BLOCK_ONLY_HIGH',
    'LOCK_MEDIUM_AND_ABOVE',
    'BLOCK_LOW_AND_ABOVE',
    'HARM_BLOCK_THRESHOLD_UNSPECIFIED'
];

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