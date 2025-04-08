import {config} from './config';

/**
 * KV存储接口抽象
 * 允许在不同平台间切换实现
 */
interface KVStore {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, options?: { expireIn?: number }): Promise<void>;
    getType(): string;
}

// 定义Deno类型，避免类型错误
declare namespace Deno {
    interface Kv {
        get(key: string[]): Promise<{ value: unknown }>;
        set(key: string[], value: unknown, options?: { expireIn?: number }): Promise<void>;
    }
    function openKv(): Kv;
}

/**
 * Deno KV存储实现
 * 用于Deno Deploy环境
 */
class DenoKVStore implements KVStore {
    private kv: Deno.Kv | null = null;
    constructor() {
        try {
            // @ts-ignore - Deno API在非Deno环境会报错
            this.kv = Deno.openKv?.();
        } catch (error) {
            console.error('无法初始化Deno KV存储:', error);
        }
    }

    async get(key: string): Promise<unknown> {
        if (!this.kv) return null;
        // @ts-ignore
        const result = await this.kv.get([key]);
        return result.value;
    }

    async set(key: string, value: unknown, options?: { expireIn?: number }): Promise<void> {
        if (!this.kv) return;
        const opts = options?.expireIn ? {expireIn: options.expireIn} : undefined;
        // @ts-ignore
        await this.kv.set([key], value, opts);
    }

    getType(): string {
        return 'DenoKV';
    }
}

/**
 * 内存KV存储实现
 * 用于开发环境或非Deno环境
 */
class MemoryKVStore implements KVStore {
    private store = new Map<string, unknown>();
    private expiryMap = new Map<string, number>();

    async get(key: string): Promise<unknown> {
        // 检查是否过期
        if (this.expiryMap.has(key)) {
            const expiryTime = this.expiryMap.get(key);
            if (expiryTime && expiryTime < Date.now()) {
                this.store.delete(key);
                this.expiryMap.delete(key);
                return null;
            }
        }
        return this.store.get(key);
    }

    async set(key: string, value: unknown, options?: { expireIn?: number }): Promise<void> {
        this.store.set(key, value);

        // 设置过期时间
        if (options?.expireIn) {
            const expiryTime = Date.now() + options.expireIn;
            this.expiryMap.set(key, expiryTime);
        }
    }

    getType(): string {
        return 'MemoryKV';
    }
}

/**
 * 创建适当的KV存储实例
 */
function createKVStore(): KVStore {
    // 检测环境是否为Deno
    try {
        // @ts-ignore
        if (typeof Deno !== 'undefined' && Deno.openKv) {
            return new DenoKVStore();
        }
    } catch (e) {
        // 忽略错误
    }
    return new MemoryKVStore();
}

// 单例KV存储实例
const kvStore = createKVStore();

// KV存储键名常量
const KV_PREFIX = 'gemini_party_api_rotation';
const MODEL_ROTATION_KEY = `${KV_PREFIX}:model_rotations`;
const LAST_RESET_KEY = `${KV_PREFIX}:last_reset_time`;

/**
 * 获取并解析 GEMINI_API_KEY 列表
 * @returns 清洗后的密钥数组
 * @throws {Error}
 */
function passApiKeys(): string[] {
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
const geminiApiKeys = passApiKeys();

/**
 * 初始化或获取轮询状态
 */
async function getModelRotations(): Promise<Record<string, number>> {
    const rotations = await kvStore.get(MODEL_ROTATION_KEY);
    return (rotations as Record<string, number>) || {};
}

/**
 * 保存轮询状态
 */
async function saveModelRotation(model: string, index: number): Promise<void> {
    const rotations = await getModelRotations();
    rotations[model] = index;

    // 设置60秒过期时间
    await kvStore.set(MODEL_ROTATION_KEY, rotations, {expireIn: 60000});
}

/**
 * 获取上次重置时间
 */
async function getLastResetTime(): Promise<number> {
    const lastReset = await kvStore.get(LAST_RESET_KEY);
    if (!lastReset) {
        const now = Date.now();
        await kvStore.set(LAST_RESET_KEY, now);
        return now;
    }
    return lastReset as number;
}

/**
 * 获取API密钥
 * 通过轮询方式从预设的密钥列表中获取一个密钥，按模型区分
 * @param {string} model 模型名称，不同模型使用不同的轮训计数
 * @returns {Promise<string>} Gemini API密钥
 */
export async function getApiKey(model: string | undefined = undefined): Promise<string> {
    if (model === undefined) {
        // 安全处理第一个密钥返回
        return geminiApiKeys[0] || '';
    }

    // 获取当前模型的轮训索引
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
 * 获取API密钥轮训状态
 * @returns 包含密钥总数、各模型轮训计数和下次重置时间的状态对象
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
    const nextResetTime = lastResetTime + 60000; // 1分钟后重置
    const now = Date.now();
    const remainingTime = nextResetTime - now;

    return {
        keysTotal: geminiApiKeys.length, modelRotations, lastResetTime, nextResetTime, remainingTime, // 毫秒
        kvType: kvStore.getType(), // 返回当前KV存储类型
    };
}
