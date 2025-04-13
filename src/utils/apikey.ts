import { config } from './config';
import { getKVStore } from './kv';
import type { KVStore } from './kv';

/**
 * API密钥管理器，负责密钥的轮询、负载均衡和黑名单管理
 */
class ApiKeyManager {
    // 私有属性
    private apiKeys: string[];
    private kvPrefix: string;
    private rotationResetInterval: number;
    private blacklistTimeout: number;
    private kvStore: KVStore | null = null;
    private initPromise: Promise<void>;
    private selectionStrategy: 'LEAST_USED' | 'RANDOM';

    // 常量和键名
    private readonly MODEL_ROTATION_KEY: string;
    private readonly LAST_RESET_KEY: string;
    private readonly MODEL_USAGE_KEY: string;
    private readonly KEY_BLACKLIST_KEY: string;

    /**
     * 创建API密钥管理器
     */
    constructor(configObj = config) {
        this.apiKeys = this.parseApiKeys(configObj.api.GEMINI_API_KEY);
        this.kvPrefix = configObj.keyManagement.kvPrefix;
        this.rotationResetInterval = configObj.keyManagement.rotationResetInterval;
        this.blacklistTimeout = configObj.keyManagement.blacklistTimeout;
        this.selectionStrategy = configObj.keyManagement.KEY_SELECTION_STRATEGY === 'RANDOM' ? 'RANDOM' : 'LEAST_USED';

        // 初始化键名
        this.MODEL_ROTATION_KEY = `${this.kvPrefix}:model_rotations`;
        this.LAST_RESET_KEY = `${this.kvPrefix}:last_reset_time`;
        this.MODEL_USAGE_KEY = `${this.kvPrefix}:model_usages`;
        this.KEY_BLACKLIST_KEY = `${this.kvPrefix}:key_blacklist`;

        // 异步初始化KV存储
        this.initPromise = this.initializeKVStore();
    }

    /**
     * 异步初始化KV存储
     */
    private async initializeKVStore(): Promise<void> {
        try {
            this.kvStore = await getKVStore();
        } catch (error) {
            console.error("初始化KV存储失败:", error);
            throw error;
        }
    }

    /**
     * 确保KV存储已初始化
     */
    private async ensureKVStore(): Promise<KVStore> {
        await this.initPromise;
        if (!this.kvStore) {
            throw new Error("KV存储未初始化");
        }
        return this.kvStore;
    }

    /**
     * 解析 GEMINI_API_KEY 列表
     * @returns 清洗后的密钥数组
     * @throws {Error} 当API密钥未正确设置时抛出错误
     */
    private parseApiKeys(apiKeyInput: string | undefined): string[] {
        if (!apiKeyInput) {
            throw new Error('GEMINI_API_KEY not set correctly');
        }

        return apiKeyInput
            .split(',')
            .map((key) => key.trim())
            .filter(Boolean);
    }

    /**
     * 获取上次重置时间
     * @returns 上次重置时间(毫秒时间戳)
     */
    private async getLastResetTime(): Promise<number> {
        const kvStore = await this.ensureKVStore();
        const lastReset = await kvStore.get(this.LAST_RESET_KEY);
        if (!lastReset) {
            const now = Date.now();
            await kvStore.set(this.LAST_RESET_KEY, now);
            return now;
        }
        return lastReset as number;
    }

    /**
     * 初始化或获取轮询状态
     * @returns 各模型的轮询索引记录
     */
    private async getModelRotations(): Promise<Record<string, number>> {
        const kvStore = await this.ensureKVStore();
        const rotations = await kvStore.get(this.MODEL_ROTATION_KEY);

        // 检查上次重置时间，如果超过设定时间则重置计数
        const lastReset = await this.getLastResetTime();
        const now = Date.now();
        const timeSinceReset = now - lastReset;

        // 如果超过重置间隔，重置计数并更新重置时间
        if (timeSinceReset > this.rotationResetInterval) {
            // 更新上次重置时间为当前时间
            await kvStore.set(this.LAST_RESET_KEY, now);
            // 清除使用记录
            await kvStore.set(this.MODEL_USAGE_KEY, {});
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
    private async saveModelRotation(model: string, index: number): Promise<void> {
        const kvStore = await this.ensureKVStore();
        const rotations = await this.getModelRotations();
        rotations[model] = index;

        // 设置过期时间
        await kvStore.set(this.MODEL_ROTATION_KEY, rotations, { expireIn: this.rotationResetInterval });
    }

    /**
     * 获取API密钥使用记录
     * @returns 各模型各密钥的使用记录
     */
    private async getApiKeyUsage(): Promise<Record<string, Record<string, number>>> {
        const kvStore = await this.ensureKVStore();
        const usages = await kvStore.get(this.MODEL_USAGE_KEY);
        return (usages as Record<string, Record<string, number>>) || {};
    }

    /**
     * 记录API密钥使用
     * @param model 模型名称
     * @param keyIndex 密钥索引
     */
    private async recordApiKeyUsage(model: string, keyIndex: number): Promise<void> {
        const kvStore = await this.ensureKVStore();
        const usages = await this.getApiKeyUsage();
        if (!usages[model]) {
            usages[model] = {};
        }

        const keyId = keyIndex.toString();
        usages[model][keyId] = (usages[model][keyId] || 0) + 1;

        await kvStore.set(this.MODEL_USAGE_KEY, usages, { expireIn: this.rotationResetInterval });
    }

    /**
     * 获取黑名单记录
     * @returns 各模型的黑名单密钥列表
     */
    private async getBlacklist(): Promise<Record<string, Record<string, number>>> {
        const kvStore = await this.ensureKVStore();
        const blacklist = await kvStore.get(this.KEY_BLACKLIST_KEY);
        return (blacklist as Record<string, Record<string, number>>) || {};
    }

    /**
     * 将API密钥加入黑名单
     * @param model 模型名称
     * @param keyIndex 密钥索引
     */
    public async blacklistApiKey(model: string, keyIndex: number): Promise<void> {
        const kvStore = await this.ensureKVStore();
        const blacklist = await this.getBlacklist();
        if (!blacklist[model]) {
            blacklist[model] = {};
        }

        const keyId = keyIndex.toString();
        blacklist[model][keyId] = Date.now();

        await kvStore.set(this.KEY_BLACKLIST_KEY, blacklist, { expireIn: this.blacklistTimeout });
        console.warn(`已将密钥 #${keyIndex} 加入 ${model} 模型的黑名单，将在 ${this.blacklistTimeout / 60000} 分钟后恢复`);
    }

    /**
     * 获取API密钥
     * 基于使用频率、黑名单和轮询策略获取一个密钥
     * @param model 模型名称，不同模型使用不同的计数
     * @param retryCount 当前重试次数
     * @param options 可选配置项
     * @returns Gemini API密钥和索引
     */
    public async getApiKey(
        model: string | undefined = undefined,
        retryCount: number = 0,
        options: { recordUsage?: boolean } = { recordUsage: true }
    ): Promise<{ key: string, index: number }> {
        // 处理没有配置 API 密钥的情况
        if (this.apiKeys.length === 0) {
            console.error("错误：未配置任何 API 密钥 (GEMINI_API_KEY is empty or invalid)");
            throw new Error("未配置任何 API 密钥");
        }

        // 没有指定模型时使用简单返回
        if (model === undefined) {
            return { key: this.apiKeys[0] || '', index: 0 };
        }

        // 超过重试次数限制
        if (retryCount >= this.apiKeys.length) {
            console.error(`所有密钥都已尝试，模型 ${model} 无可用密钥`);
            // 即使重试了，也返回第一个密钥
            return { key: this.apiKeys[0] || '', index: 0 }; 
        }

        // 获取当前模型的黑名单
        const blacklist = await this.getBlacklist();
        const modelBlacklist = blacklist[model] || {};

        // 清理过期的黑名单项
        const now = Date.now();
        let hasExpiredItems = false;
        Object.entries(modelBlacklist).forEach(([keyId, timestamp]) => {
            if (now - timestamp > this.blacklistTimeout) {
                delete modelBlacklist[keyId];
                hasExpiredItems = true;
            }
        });

        if (hasExpiredItems) {
            blacklist[model] = modelBlacklist;
            await this.ensureKVStore().then(kvStore => kvStore.set(this.KEY_BLACKLIST_KEY, blacklist, { expireIn: this.blacklistTimeout }));
        }

        // 获取可用密钥索引列表
        const availableKeyIndices: number[] = [];
        for (let i = 0; i < this.apiKeys.length; i++) {
            if (!modelBlacklist[i.toString()]) {
                availableKeyIndices.push(i);
            }
        }

        let selectedIndex: number;

        // 如果没有可用密钥（全部在黑名单中），则使用传统轮询
        if (availableKeyIndices.length === 0) {
            console.warn(`模型 ${model} 的所有密钥都在黑名单中，将使用传统轮询选择密钥。`);
            // 获取当前模型的轮询索引
            const rotations = await this.getModelRotations();
            let currentIndex = rotations[model] || 0;
            // 确保索引在有效范围内
            currentIndex = currentIndex % this.apiKeys.length;
            // 更新并保存轮询索引
            await this.saveModelRotation(model, currentIndex + 1);
            selectedIndex = currentIndex;
        }
        // 根据策略选择密钥
        else if (this.selectionStrategy === 'RANDOM') {
            // 随机选择一个可用密钥
            const randomIndex = Math.floor(Math.random() * availableKeyIndices.length);
            selectedIndex = availableKeyIndices[randomIndex]!;
        } else { // LEAST_USED
            // 获取API密钥使用记录
            const usages = await this.getApiKeyUsage();
            const modelUsage = usages[model] || {};

            // 寻找使用频率最低的可用密钥
            let leastUsedIndex = -1;
            let leastUsageCount = Infinity;

            for (const index of availableKeyIndices) {
                const usageCount = modelUsage[index.toString()] || 0;
                if (usageCount < leastUsageCount) {
                    leastUsageCount = usageCount;
                    leastUsedIndex = index;
                }
            }
            // 如果 leastUsedIndex 没有被赋值，则使用第一个可用密钥
            selectedIndex = leastUsedIndex !== -1 ? leastUsedIndex : availableKeyIndices[0]!;
        }

        // 记录API密钥使用
        if (options.recordUsage) {
            await this.recordApiKeyUsage(model, selectedIndex);
        }

        // selectedIndex 在这里保证是一个数字，如果 apiKeys 不为空
        return { key: this.apiKeys[selectedIndex]!, index: selectedIndex };
    }

    /**
     * 判断错误是否可重试
     * @param error 错误对象
     * @returns 是否可重试
     */
    private isRetryableError(error: any): boolean {
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
     * 带重试的API请求包装器
     * @param model 模型名称
     * @param apiCallFn API调用函数
     * @param options 负载均衡选项
     * @returns API调用结果
     */
    public async withRetry<T>(
        model: string,
        apiCallFn: (key: string) => Promise<T>,
        options: BalancingOptions = {}
    ): Promise<T> {
        // 设置默认选项
        const defaultMaxRetries = config.keyManagement.defaultMaxRetries;
        const calculatedMaxRetries = defaultMaxRetries === -1
            ? Infinity
            : Math.min(defaultMaxRetries, this.apiKeys.length);

        const balancingOptions: Required<BalancingOptions> = {
            recordUsage: options.recordUsage ?? true,
            useBlacklist: options.useBlacklist ?? true,
            maxRetries: options.maxRetries ?? calculatedMaxRetries
        };

        let lastError: any = null;

        for (let retryCount = 0; retryCount < balancingOptions.maxRetries; retryCount++) {
            const { key, index } = await this.getApiKey(model, retryCount, {
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
                if (balancingOptions.useBlacklist && this.isRetryableError(error)) {
                    await this.blacklistApiKey(model, index);
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
    public async withoutBalancing<T>(apiCallFn: (key: string) => Promise<T>): Promise<T> {
        const { key } = await this.getApiKey(undefined, 0, { recordUsage: false });

        try {
            return await apiCallFn(key);
        } catch (error) {
            console.error('非负载均衡API调用失败:', error);
            throw error;
        }
    }

    /**
     * 获取API密钥轮询状态
     * @returns 包含密钥总数、各模型轮询计数和下次重置时间的状态对象
     */
    public async getRotationStatus(): Promise<{
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
        const kvStore = await this.ensureKVStore();
        const lastResetTime = await this.getLastResetTime();
        const nextResetTime = lastResetTime + this.rotationResetInterval;
        const now = Date.now();
        const remainingTime = nextResetTime - now;
        const modelUsages = await this.getApiKeyUsage();
        const blacklist = await this.getBlacklist();

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
        for (let i = 0; i < this.apiKeys.length; i++) {
            const keyIndex = i.toString();
            const keyStatus: "active" | "blacklisted" = this.isKeyBlacklisted(keyIndex, blacklist) ? "blacklisted" : "active";

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
                        const expiryTime = keyMap[keyIndex] + this.blacklistTimeout;
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
                totalKeys: this.apiKeys.length,
                activeKeys: this.apiKeys.length - blacklistedKeys,
                blacklistedKeys,
                resetIn: remainingTime,
                kvType: kvStore.getType() // 使用已初始化的kvStore
            },
            modelStats,
            keys
        };
    }

    // 辅助函数：检查密钥是否在任何模型的黑名单中
    private isKeyBlacklisted(keyIndex: string, blacklist: Record<string, Record<string, number>>): boolean {
        for (const model in blacklist) {
            const modelBlacklist = blacklist[model];
            if (modelBlacklist && modelBlacklist[keyIndex]) {
                return true;
            }
        }
        return false;
    }
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

// 创建单例实例
const apiKeyManager = new ApiKeyManager();

// 导出兼容的接口函数
export const getApiKey = apiKeyManager.getApiKey.bind(apiKeyManager);
export const blacklistApiKey = apiKeyManager.blacklistApiKey.bind(apiKeyManager);
export const withRetry = apiKeyManager.withRetry.bind(apiKeyManager);
export const withoutBalancing = apiKeyManager.withoutBalancing.bind(apiKeyManager);
export const getRotationStatus = apiKeyManager.getRotationStatus.bind(apiKeyManager);

// 导出管理器实例（用于高级使用场景）
export { apiKeyManager };
