import type { KVStore } from './interfaces';

/**
 * 内存KV存储实现
 * 用于开发环境或非Deno环境
 */
export class MemoryKVStore implements KVStore {
    private store = new Map<string, unknown>();
    private expiryMap = new Map<string, number>();
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        // 添加定期清理过期项的机制
        this.cleanupInterval = setInterval(this.cleanupExpiredItems.bind(this), 60000);
    }

    /**
     * 清理过期的键值对
     */
    private cleanupExpiredItems(): void {
        const now = Date.now();
        this.expiryMap.forEach((expiryTime, key) => {
            if (expiryTime < now) {
                this.store.delete(key);
                this.expiryMap.delete(key);
            }
        });
    }

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