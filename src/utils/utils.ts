/**
 * 创建标准化的错误响应
 * @param {any} error - 错误对象
 * @returns {Object} 包含状态码和错误消息的对象
 */
export function createErrorResponse(error: any) {
    const status = error.status || 500;
    const message = error.error?.message || error.message || 'Unknown error';
    const type = error.error?.type || error.type || "invalid_request_error";
    return { status, body: { error: { message, type } } };
}

// --- API密钥管理 ---
if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
}
const geminiAPIKeys = process.env.GEMINI_API_KEY.split(",");
let apiKeyRotationIndex = 0;

/**
 * 获取API密钥
 * 通过轮询方式从预设的密钥列表中获取一个密钥
 * @returns {string} Gemini API密钥
 */
export function getAPIKey(): string {
    apiKeyRotationIndex = apiKeyRotationIndex % geminiAPIKeys.length;
    const key = geminiAPIKeys[apiKeyRotationIndex];
    apiKeyRotationIndex++;
    if (!key) { return '' }
    return key;
}

