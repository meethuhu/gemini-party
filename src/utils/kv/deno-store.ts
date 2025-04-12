import type { KVStore } from "./interfaces";

/**
 * Deno KV存储实现
 * 用于Deno Deploy环境
 */
export class DenoKVStore implements KVStore {
  private kv: any;

  constructor() {
    // 在构造函数中直接初始化KV存储
    // 如果不在Deno环境中，这会抛出错误
    if (typeof Deno === "undefined" || !Deno.openKv) {
      throw new Error("当前环境不支持Deno KV");
    }

    // 异步初始化，但构造函数无法直接使用await
    // 创建一个初始化Promise，稍后可以await
    this._initPromise = this._init();
  }

  private _initPromise: Promise<void>;

  private async _init(): Promise<void> {
    try {
      // @ts-ignore - Deno API
      this.kv = await Deno.openKv();
    } catch (error) {
      throw new Error(
        `无法初始化Deno KV: ${error instanceof Error ? error.message : "未知错误"}`
      );
    }
  }

  async get(key: string): Promise<unknown> {
    // 确保KV已初始化
    await this._initPromise;

    // 直接获取并返回值
    const result = await this.kv.get([key]);
    return result?.value || null;
  }

  async set(
    key: string,
    value: unknown,
    options?: { expireIn?: number }
  ): Promise<void> {
    // 确保KV已初始化
    await this._initPromise;

    // 设置值，必要时使用过期选项
    const opts = options?.expireIn ? { expireIn: options.expireIn } : undefined;
    await this.kv.set([key], value, opts);
  }

  getType(): string {
    return "DenoKV";
  }
}
