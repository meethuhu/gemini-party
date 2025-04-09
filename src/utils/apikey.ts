import { config } from './config';
import { kvStore as kvStoreInstance } from './kv';

// 常量配置
const KV_PREFIX = config.keyManagement.kvPrefix;
const MODEL_ROTATION_KEY = `${KV_PREFIX}:model_rotations`;
const LAST_RESET_KEY = `${KV_PREFIX}:last_reset_time`;
const MODEL_USAGE_KEY = `${KV_PREFIX}:model_usages`;
const KEY_BLACKLIST_KEY = `${KV_PREFIX}:key_blacklist`;
const ROTATION_RESET_INTERVAL = config.keyManagement.rotationResetInterval; // 轮询重置间隔(毫秒)
const BLACKLIST_TIMEOUT = config.keyManagement.blacklistTimeout; // 黑名单超时时间(毫秒)

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
        // 清除使用记录
        await kvStoreInstance.set(MODEL_USAGE_KEY, {});
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
 * 获取API密钥使用记录
 * @returns 各模型各密钥的使用记录
 */
async function getApiKeyUsage(): Promise<Record<string, Record<string, number>>> {
    const usages = await kvStoreInstance.get(MODEL_USAGE_KEY);
    return (usages as Record<string, Record<string, number>>) || {};
}

/**
 * 记录API密钥使用
 * @param model 模型名称
 * @param keyIndex 密钥索引
 */
async function recordApiKeyUsage(model: string, keyIndex: number): Promise<void> {
    const usages = await getApiKeyUsage();
    if (!usages[model]) {
        usages[model] = {};
    }

    const keyId = keyIndex.toString();
    usages[model][keyId] = (usages[model][keyId] || 0) + 1;

    await kvStoreInstance.set(MODEL_USAGE_KEY, usages, { expireIn: ROTATION_RESET_INTERVAL });
}

/**
 * 获取黑名单记录
 * @returns 各模型的黑名单密钥列表
 */
async function getBlacklist(): Promise<Record<string, Record<string, number>>> {
    const blacklist = await kvStoreInstance.get(KEY_BLACKLIST_KEY);
    return (blacklist as Record<string, Record<string, number>>) || {};
}

/**
 * 将API密钥加入黑名单
 * @param model 模型名称
 * @param keyIndex 密钥索引
 */
export async function blacklistApiKey(model: string, keyIndex: number): Promise<void> {
    const blacklist = await getBlacklist();
    if (!blacklist[model]) {
        blacklist[model] = {};
    }

    const keyId = keyIndex.toString();
    blacklist[model][keyId] = Date.now();

    await kvStoreInstance.set(KEY_BLACKLIST_KEY, blacklist, { expireIn: BLACKLIST_TIMEOUT });
    console.warn(`已将密钥 #${keyIndex} 加入 ${model} 模型的黑名单，将在 ${BLACKLIST_TIMEOUT / 60000} 分钟后恢复`);
}

/**
 * 获取API密钥
 * 基于使用频率、黑名单和轮询策略获取一个密钥
 * @param model 模型名称，不同模型使用不同的计数
 * @param retryCount 当前重试次数
 * @param options 可选配置项
 * @returns Gemini API密钥和索引
 */
export async function getApiKey(
    model: string | undefined = undefined,
    retryCount: number = 0,
    options: { recordUsage?: boolean } = { recordUsage: true }
): Promise<{ key: string, index: number }> {
    // 没有指定模型时使用简单返回
    if (model === undefined) {
        return { key: geminiApiKeys[0] || '', index: 0 };
    }

    // 超过重试次数限制
    if (retryCount >= geminiApiKeys.length) {
        console.error(`所有密钥都已尝试，模型 ${model} 无可用密钥`);
        return { key: geminiApiKeys[0] || '', index: 0 };
    }

    // 获取当前模型的黑名单
    const blacklist = await getBlacklist();
    const modelBlacklist = blacklist[model] || {};

    // 清理过期的黑名单项
    const now = Date.now();
    let hasExpiredItems = false;
    Object.entries(modelBlacklist).forEach(([keyId, timestamp]) => {
        if (now - timestamp > BLACKLIST_TIMEOUT) {
            delete modelBlacklist[keyId];
            hasExpiredItems = true;
        }
    });

    if (hasExpiredItems) {
        blacklist[model] = modelBlacklist;
        await kvStoreInstance.set(KEY_BLACKLIST_KEY, blacklist, { expireIn: BLACKLIST_TIMEOUT });
    }

    // 获取API密钥使用记录
    const usages = await getApiKeyUsage();
    const modelUsage = usages[model] || {};

    // 寻找使用频率最低且不在黑名单中的密钥
    let leastUsedIndex = -1;
    let leastUsageCount = Infinity;

    for (let i = 0; i < geminiApiKeys.length; i++) {
        // 跳过黑名单中的密钥
        if (modelBlacklist[i.toString()]) {
            continue;
        }

        const usageCount = modelUsage[i.toString()] || 0;
        if (usageCount < leastUsageCount) {
            leastUsageCount = usageCount;
            leastUsedIndex = i;
        }
    }

    // 如果找不到可用密钥（全部在黑名单中），则使用传统轮询
    if (leastUsedIndex === -1) {
        // 获取当前模型的轮询索引
        const rotations = await getModelRotations();
        let currentIndex = rotations[model] || 0;
        // 确保索引在有效范围内
        currentIndex = currentIndex % geminiApiKeys.length;
        // 更新并保存轮询索引
        await saveModelRotation(model, currentIndex + 1);
        return { key: geminiApiKeys[currentIndex] || '', index: currentIndex };
    }

    // 记录API密钥使用
    if (options.recordUsage) {
        await recordApiKeyUsage(model, leastUsedIndex);
    }

    return { key: geminiApiKeys[leastUsedIndex] || '', index: leastUsedIndex };
}

/**
 * 负载均衡选项接口
 */
export interface BalancingOptions {
    /** 是否记录API使用次数 */
    recordUsage?: boolean;
    /** 是否使用黑名单机制 */
    useBlacklist?: boolean;
    /** 最大重试次数，默认为3或密钥总数（取较小值） */
    maxRetries?: number;
}

/**
 * 带重试的API请求包装器
 * @param model 模型名称
 * @param apiCallFn API调用函数
 * @param options 负载均衡选项
 * @returns API调用结果
 */
export async function withRetry<T>(
    model: string,
    apiCallFn: (key: string) => Promise<T>,
    options: BalancingOptions = {}
): Promise<T> {
    // 设置默认选项
    const balancingOptions: Required<BalancingOptions> = {
        recordUsage: options.recordUsage ?? true,
        useBlacklist: options.useBlacklist ?? true,
        maxRetries: options.maxRetries ?? Math.min(config.keyManagement.defaultMaxRetries, geminiApiKeys.length)
    };

    let lastError: any = null;

    for (let retryCount = 0; retryCount < balancingOptions.maxRetries; retryCount++) {
        const { key, index } = await getApiKey(model, retryCount, {
            recordUsage: balancingOptions.recordUsage
        });

        try {
            return await apiCallFn(key);
        } catch (error: any) {
            console.error(
                `API调用失败 (模型: ${model}, 密钥索引: ${index}, 重试: ${retryCount + 1}/${balancingOptions.maxRetries}):`,
                error.message || error
            );

            // 只有特定类型的错误才重试并加入黑名单，且仅当启用黑名单机制时
            if (balancingOptions.useBlacklist && isRetryableError(error)) {
                await blacklistApiKey(model, index);
                lastError = error;
                continue;
            }

            // 非可重试的错误或禁用黑名单机制时直接抛出
            throw error;
        }
    }

    // 如果所有重试都失败了
    throw lastError || new Error(`所有API密钥都已尝试但请求失败 (模型: ${model})`);
}

/**
 * 不参与负载均衡的API请求包装器
 * 适用于不消耗配额的轻量级操作，如获取模型列表
 * @param apiCallFn API调用函数
 * @returns API调用结果
 */
export async function withoutBalancing<T>(apiCallFn: (key: string) => Promise<T>): Promise<T> {
    const { key } = await getApiKey(undefined, 0, { recordUsage: false });

    try {
        return await apiCallFn(key);
    } catch (error) {
        console.error('非负载均衡API调用失败:', error);
        throw error;
    }
}

/**
 * 判断错误是否可重试
 * @param error 错误对象
 * @returns 是否可重试
 */
function isRetryableError(error: any): boolean {
    // 如果是网络错误或API限流错误，则可以重试
    const errorMessage = String(error.message || error).toLowerCase();

    // API密钥无效或配额用尽
    if (
        errorMessage.includes('api key not valid') ||
        errorMessage.includes('quota exceeded') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests')
    ) {
        return true;
    }

    // 服务器错误（5xx）可以重试
    if (error.status) {
        return error.status >= 500 && error.status < 600;
    }

    // 网络错误可以重试
    if (error.code) {
        return [
            'ECONNRESET',
            'ETIMEDOUT',
            'ECONNABORTED',
            'EHOSTUNREACH',
            'ENETUNREACH'
        ].includes(error.code);
    }

    return false;
}

/**
 * 获取API密钥轮询状态
 * @returns 包含密钥总数、各模型轮询计数和下次重置时间的状态对象
 */
export async function getRotationStatus(): Promise<{
    summary: {
        totalKeys: number;
        activeKeys: number;
        blacklistedKeys: number;
        resetIn: number; // 毫秒
        kvType: string;
    };
    modelStats: Array<{
        name: string;
        totalRequests: number;
        keyDistribution: Record<string, number>;
    }>;
    keys: Array<{
        index: number;
        status: "active" | "blacklisted";
        usage: {
            total: number;
            byModel: Record<string, number>;
        };
        blacklistInfo?: {
            models: string[];
            expiresAt: number;
            remainingTime: number; // 毫秒
        };
    }>;
}> {
    const modelRotations = await getModelRotations();
    const lastResetTime = await getLastResetTime();
    const nextResetTime = lastResetTime + ROTATION_RESET_INTERVAL;
    const now = Date.now();
    const remainingTime = nextResetTime - now;
    const modelUsages = await getApiKeyUsage();
    const blacklist = await getBlacklist();

    // 处理密钥状态
    const keys: Array<{
        index: number;
        status: "active" | "blacklisted";
        usage: {
            total: number;
            byModel: Record<string, number>;
        };
        blacklistInfo?: {
            models: string[];
            expiresAt: number;
            remainingTime: number;
        };
    }> = [];

    const modelStats: Array<{
        name: string;
        totalRequests: number;
        keyDistribution: Record<string, number>;
    }> = [];

    const modelSet = new Set<string>();

    // 收集所有模型名称
    Object.keys(modelUsages).forEach(model => modelSet.add(model));

    // 准备密钥状态数据
    for (let i = 0; i < geminiApiKeys.length; i++) {
        const keyIndex = i.toString();
        const keyStatus: "active" | "blacklisted" = isKeyBlacklisted(keyIndex, blacklist) ? "blacklisted" : "active";

        // 计算总使用量和按模型分布
        let totalUsage = 0;
        const byModel: Record<string, number> = {};

        modelSet.forEach(model => {
            const usage = (modelUsages[model] || {})[keyIndex] || 0;
            byModel[model] = usage;
            totalUsage += usage;
        });

        const keyInfo = {
            index: i,
            status: keyStatus,
            usage: {
                total: totalUsage,
                byModel
            }
        } as const;

        // 如果在黑名单中，添加黑名单信息
        if (keyStatus === "blacklisted") {
            const blacklistedModels: string[] = [];
            let earliestExpiry = Infinity;

            Object.entries(blacklist).forEach(([model, keyMap]) => {
                if (keyMap && keyMap[keyIndex]) {
                    blacklistedModels.push(model);
                    const expiryTime = keyMap[keyIndex] + BLACKLIST_TIMEOUT;
                    earliestExpiry = Math.min(earliestExpiry, expiryTime);
                }
            });

            keys.push({
                ...keyInfo,
                blacklistInfo: {
                    models: blacklistedModels,
                    expiresAt: earliestExpiry,
                    remainingTime: Math.max(0, earliestExpiry - now)
                }
            });
        } else {
            keys.push(keyInfo);
        }
    }

    // 准备模型统计数据
    modelSet.forEach(model => {
        const usage = modelUsages[model] || {};
        let totalRequests = 0;
        const keyDistribution: Record<string, number> = {};

        Object.entries(usage).forEach(([keyIndex, count]) => {
            totalRequests += count as number;
            keyDistribution[keyIndex] = count as number;
        });

        modelStats.push({
            name: model,
            totalRequests,
            keyDistribution
        });
    });

    // 计算活跃和黑名单密钥数量
    const blacklistedKeys = keys.filter(k => k.status === "blacklisted").length;

    return {
        summary: {
            totalKeys: geminiApiKeys.length,
            activeKeys: geminiApiKeys.length - blacklistedKeys,
            blacklistedKeys,
            resetIn: remainingTime,
            kvType: kvStoreInstance.getType()
        },
        modelStats,
        keys
    };
}

// 辅助函数：检查密钥是否在任何模型的黑名单中
function isKeyBlacklisted(keyIndex: string, blacklist: Record<string, Record<string, number>>): boolean {
    for (const model in blacklist) {
        const modelBlacklist = blacklist[model];
        if (modelBlacklist && modelBlacklist[keyIndex]) {
            return true;
        }
    }
    return false;
}
