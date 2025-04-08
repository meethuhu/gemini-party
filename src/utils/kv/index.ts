import type { KVStore } from './interfaces';
import { DenoKVStore } from './deno-store';
import { MemoryKVStore } from './memory-store';

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

// 导出单例KV存储实例
export const kvStore = createKVStore(); 