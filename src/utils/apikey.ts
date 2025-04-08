/**
 * 获取并解析 GEMINI_API_KEY 列表
 * @returns 清洗后的密钥数组
 * @throws {Error}
 */
function passApiKeys(): string[] {
    const apiKeyArray = process.env.GEMINI_API_KEY;
    if (!apiKeyArray) {
        throw new Error('GEMINI_API_KEY not set correctly');
    }
    return apiKeyArray
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean);
}

// 模型计数器
const modelKeyRotationMap = new Map<string, number>();
const geminiApiKeys = passApiKeys();

// 记录重置时间
let lastResetTime = Date.now();
let nextResetTime = lastResetTime + 60000;

// 添加定时器，每分钟重置所有计数器
setInterval(() => {
    modelKeyRotationMap.clear();
    // console.log('API 密钥轮训计数器已重置');
    lastResetTime = Date.now();
    nextResetTime = lastResetTime + 60000;
}, 60000); // 60000ms = 1分钟

/**
 * 获取API密钥
 * 通过轮询方式从预设的密钥列表中获取一个密钥，按模型区分
 * @param {string} model 模型名称，不同模型使用不同的轮训计数
 * @returns {string} Gemini API密钥
 */
export function getApiKey(model: string | undefined = undefined): string {
    if (model === undefined) {
        console.log(undefined);
        return geminiApiKeys[0] as string;
    }

    // 获取当前模型的轮训索引，如果不存在则初始化为0
    let currentIndex = modelKeyRotationMap.get(model) || 0;

    // 确保索引在有效范围内
    currentIndex = currentIndex % geminiApiKeys.length;

    // 获取密钥
    const key = geminiApiKeys[currentIndex];

    // 更新索引
    modelKeyRotationMap.set(model, currentIndex + 1);

    return key as string;
}

/**
 * 获取API密钥轮训状态
 * @returns 包含密钥总数、各模型轮训计数和下次重置时间的状态对象
 */
export function getRotationStatus(): {
    keysTotal: number;
    modelRotations: Record<string, number>;
    lastResetTime: number;
    nextResetTime: number;
    remainingTime: number;
} {
    // 将Map转换为普通对象以便JSON序列化
    const modelRotations: Record<string, number> = {};
    modelKeyRotationMap.forEach((value, key) => {
        modelRotations[key] = value;
    });

    const now = Date.now();
    const remainingTime = nextResetTime - now;

    return {
        keysTotal: geminiApiKeys.length, modelRotations, lastResetTime, nextResetTime, remainingTime, // 毫秒
    };
}
