/**
 * KV存储接口抽象
 * 允许在不同平台间切换实现
 */
export interface KVStore {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, options?: { expireIn?: number }): Promise<void>;
    delete?(key: string): Promise<boolean>;
    getMany?(keys: string[]): Promise<Record<string, unknown>>;
    setMany?(entries: Record<string, unknown>, options?: { expireIn?: number }): Promise<void>;
    clear?(): Promise<void>;
    getType(): string;
}

/**
 * KVStore 构造函数类型定义
 * 用于表示可以实例化 KVStore 对象的构造函数
 */
export interface KVStoreConstructor {
  new (): KVStore;
}

// 定义Deno类型，避免类型错误
declare namespace Deno {
    interface Kv {
        get(key: string[] | Deno.KvKey): Promise<Deno.KvEntryMaybe<unknown>>;
        set(key: string[] | Deno.KvKey, value: unknown, options?: { expireIn?: number }): Promise<Deno.KvCommitResult>;
    }
    
    interface KvKey {
        [index: number]: string | number | boolean | Uint8Array;
        length: number;
    }
    
    interface KvEntryMaybe<T> {
        key: KvKey;
        value: T | null;
        versionstamp: string | null;
    }
    
    interface KvCommitResult {
        ok: boolean;
        versionstamp: string;
    }
    
    function openKv(): Promise<Kv>;
}