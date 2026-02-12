import { redis } from "./redis";

export async function getJson<T>(key: string): Promise<T | null> {
  const value = await redis.get<T>(key);
  return value ?? null;
}

export async function setJson<T>(key: string, value: T, ttlSeconds: number) {
  await redis.set(key, value, { ex: ttlSeconds });
}
