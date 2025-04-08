import type { KVStore } from './interfaces';

/**
 * Deno KV存储实现
 * 用于Deno Deploy环境
 */
export class DenoKVStore implements KVStore {
    private kv: any | null = null;
    
    constructor() {
        try {
            // @ts-ignore - Deno API在非Deno环境会报错
            Deno.openKv?.().then(kv => {
                this.kv = kv;
            }).catch((error: unknown) => {
                console.error('无法初始化Deno KV存储:', error);
            });
        } catch (error: unknown) {
            console.error('无法初始化Deno KV存储:', error);
        }
    }

    async get(key: string): Promise<unknown> {
        if (!this.kv) return null;
        try {
            // @ts-ignore
            const result = await this.kv.get([key]);
            return result?.value || null;
        } catch (error: unknown) {
            console.error(`Deno KV get错误 (${key}):`, error);
            return null;
        }
    }

    async set(key: string, value: unknown, options?: { expireIn?: number }): Promise<void> {
        if (!this.kv) return;
        try {
            const opts = options?.expireIn ? {expireIn: options.expireIn} : undefined;
            // @ts-ignore
            await this.kv.set([key], value, opts);
        } catch (error: unknown) {
            console.error(`Deno KV set错误 (${key}):`, error);
        }
    }

    getType(): string {
        return 'DenoKV';
    }
} 