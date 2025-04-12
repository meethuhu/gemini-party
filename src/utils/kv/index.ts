import type { KVStore } from "./interfaces";
import { DenoKVStore } from "./deno-store";
import { MemoryKVStore } from "./memory-store";

// 检测当前是否在Deno环境
const isDenoEnv = (): boolean =>
  typeof Deno !== "undefined" && Deno.openKv !== undefined;

/**
 * 创建KV存储实例 - 基于当前环境自动选择最佳实现
 * 在Deno环境中返回DenoKVStore，其他环境返回MemoryKVStore
 */
export async function createKVStore(options?: {
  type?: "memory" | "deno";
}): Promise<KVStore> {
  // 显式指定类型时的处理
  if (options?.type === "memory") {
    return new MemoryKVStore();
  }

  if (options?.type === "deno") {
    // 如果明确要求Deno KV但环境不支持，则直接抛出错误
    if (!isDenoEnv()) {
      throw new Error("当前环境不支持Deno KV");
    }
    return new DenoKVStore();
  }

  // 自动检测环境
  return isDenoEnv() ? new DenoKVStore() : new MemoryKVStore();
}

// KV提供者类型常量
export const KVProviders = {
  MEMORY: "memory",
  DENO: "deno",
} as const;

export type KVProviderType = (typeof KVProviders)[keyof typeof KVProviders];

// 导出默认KV实例 - 懒加载模式
let defaultKVStore: KVStore | null = null;

/**
 * 获取默认的KV存储实例（懒加载）
 * 在首次调用时初始化，后续调用返回缓存实例
 */
export async function getKVStore(): Promise<KVStore> {
  if (!defaultKVStore) {
    defaultKVStore = await createKVStore();
  }
  return defaultKVStore;
}

// 为了向后兼容，创建一个默认的内存存储实例并导出
// 这样之前依赖直接导入kvStore的代码仍能正常工作
export const kvStore: KVStore = new MemoryKVStore();

// 在Deno环境中尝试初始化并自动切换
if (isDenoEnv()) {
  createKVStore({ type: "deno" })
    .then((store) => {
      // 用异步创建的Deno存储替换内存实例中的方法
      Object.assign(kvStore, store);
      console.log("已自动切换到Deno KV存储");
    })
    .catch((error) => {
      console.warn("无法初始化Deno KV存储:", error);
    });
}

// 重新导出接口和实现类
export * from "./interfaces";
export { DenoKVStore } from "./deno-store";
export { MemoryKVStore } from "./memory-store";
