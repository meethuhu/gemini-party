/**
 * 获取并解析 GEMINI_API_KEY 列表
 * @returns 清洗后的密钥数组
 * @throws {Error} 
 */
function passApiKeys(): string[] {
    const apiKeyArray = process.env.GEMINI_API_KEY;
    if (!apiKeyArray) {
        throw new Error('GEMINI_API_KEY not set correctly')
    }
    return apiKeyArray
        .split(',')
        .map(key => key.trim())
        .filter(Boolean);
}

let keyRotationIndex = 0;
const geminiApiKeys = passApiKeys();

/**
 * 获取API密钥
 * 通过轮询方式从预设的密钥列表中获取一个密钥
 * @returns {string} Gemini API密钥
 */
export function getApiKey(): string {
    keyRotationIndex = keyRotationIndex % geminiApiKeys.length;
    const key = geminiApiKeys[keyRotationIndex];
    keyRotationIndex++;

    return key as string;
}