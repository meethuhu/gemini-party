import { config } from './config';
import { kvStore as kvStoreInstance } from './kv';

// 常量配置
const KV_PREFIX = 'gemini_party_api_rotation';
const MODEL_ROTATION_KEY = `${KV_PREFIX}:model_rotations`;
const LAST_RESET_KEY = `${KV_PREFIX}:last_reset_time`;
const ROTATION_RESET_INTERVAL = 60000; // 轮询重置间隔(毫秒) - 1分钟

/**
 * 解析 GEMINI_API_KEY 列表
 * @returns 清洗后的密钥数组
 * @throws {Error} 当API密钥未正确设置时抛出错误
 */
function parseApiKeys(): string[] {
    const apiKeyArray = config.api.GEMINI_API_KEY;
    if (!apiKeyArray) {
        throw new Error('GEMINI_API_KEY not set correctly');
    }

    return apiKeyArray
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean);
}

// 缓存API密钥数组
const geminiApiKeys = parseApiKeys();

/**
 * 获取上次重置时间
 * @returns 上次重置时间(毫秒时间戳)
 */
async function getLastResetTime(): Promise<number> {
    const lastReset = await kvStoreInstance.get(LAST_RESET_KEY);
    if (!lastReset) {
        const now = Date.now();
        await kvStoreInstance.set(LAST_RESET_KEY, now);
        return now;
    }
    return lastReset as number;
}

/**
 * 初始化或获取轮询状态
 * @returns 各模型的轮询索引记录
 */
async function getModelRotations(): Promise<Record<string, number>> {
    const rotations = await kvStoreInstance.get(MODEL_ROTATION_KEY);

    // 检查上次重置时间，如果超过设定时间则重置计数
    const lastReset = await getLastResetTime();
    const now = Date.now();
    const timeSinceReset = now - lastReset;

    // 如果超过重置间隔，重置计数并更新重置时间
    if (timeSinceReset > ROTATION_RESET_INTERVAL) {
        // 更新上次重置时间为当前时间
        await kvStoreInstance.set(LAST_RESET_KEY, now);
        // 返回空对象以重置所有模型的轮询计数
        return {};
    }

    return (rotations as Record<string, number>) || {};
}

/**
 * 保存轮询状态
 * @param model 模型名称
 * @param index 轮询索引
 */
async function saveModelRotation(model: string, index: number): Promise<void> {
    const rotations = await getModelRotations();
    rotations[model] = index;

    // 设置过期时间
    await kvStoreInstance.set(MODEL_ROTATION_KEY, rotations, { expireIn: ROTATION_RESET_INTERVAL });
}

/**
 * 获取API密钥
 * 通过轮询方式从预设的密钥列表中获取一个密钥，按模型区分
 * @param model 模型名称，不同模型使用不同的轮询计数
 * @returns Gemini API密钥
 */
export async function getApiKey(model: string | undefined = undefined): Promise<string> {
    if (model === undefined) {
        // 安全处理第一个密钥返回
        return geminiApiKeys[0] || '';
    }
    // 获取当前模型的轮询索引
    const rotations = await getModelRotations();
    let currentIndex = rotations[model] || 0;
    // 确保索引在有效范围内
    currentIndex = currentIndex % geminiApiKeys.length;
    // 获取密钥
    const key = geminiApiKeys[currentIndex] || '';
    // 更新并保存索引
    await saveModelRotation(model, currentIndex + 1);
    return key;
}

/**
 * 获取API密钥轮询状态
 * @returns 包含密钥总数、各模型轮询计数和下次重置时间的状态对象
 */
export async function getRotationStatus(): Promise<{
    keysTotal: number;
    modelRotations: Record<string, number>;
    lastResetTime: number;
    nextResetTime: number;
    remainingTime: number;
    kvType: string;
}> {
    const modelRotations = await getModelRotations();
    const lastResetTime = await getLastResetTime();
    const nextResetTime = lastResetTime + ROTATION_RESET_INTERVAL;
    const now = Date.now();
    const remainingTime = nextResetTime - now;

    return {
        keysTotal: geminiApiKeys.length,
        modelRotations,
        lastResetTime,
        nextResetTime,
        remainingTime,
        kvType: kvStoreInstance.getType(),
    };
}
