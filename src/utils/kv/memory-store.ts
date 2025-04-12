import type { KVStore } from "./interfaces";

/**
 * 内存KV存储实现
 * 用于开发环境或非Deno环境
 */
export class MemoryKVStore implements KVStore {
  private store = new Map<string, unknown>();
  private expiryMap = new Map<string, number>();
  private cleanupInterval: any = null;

  constructor() {
    // 添加定期清理过期项的机制
    this.cleanupInterval = setInterval(
      this.cleanupExpiredItems.bind(this),
      60000
    );
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

  /**
   * 销毁存储实例，清除定时器
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
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
    return this.store.get(key) ?? null;
  }

  async set(
    key: string,
    value: unknown,
    options?: { expireIn?: number }
  ): Promise<void> {
    this.store.set(key, value);

    // 设置过期时间
    if (options?.expireIn) {
      const expiryTime = Date.now() + options.expireIn;
      this.expiryMap.set(key, expiryTime);
    } else {
      // 如果没有设置过期时间，确保移除可能存在的过期设置
      this.expiryMap.delete(key);
    }
  }

  /**
   * 删除键值对
   */
  async delete(key: string): Promise<boolean> {
    this.expiryMap.delete(key);
    return this.store.delete(key);
  }

  /**
   * 获取多个键的值
   */
  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = await this.get(key);
    }
    return result;
  }

  /**
   * 批量设置键值对
   */
  async setMany(
    entries: Record<string, unknown>,
    options?: { expireIn?: number }
  ): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value, options);
    }
  }

  /**
   * 清空存储
   */
  async clear(): Promise<void> {
    this.store.clear();
    this.expiryMap.clear();
  }

  getType(): string {
    return "MemoryKV";
  }
}
