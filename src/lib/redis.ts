import { Redis } from "@upstash/redis";

const UPSTASH_URL = (process.env.UPSTASH_URL || "").trim();
const UPSTASH_TOKEN = (process.env.UPSTASH_TOKEN || "").trim();
const isRedisConfigured = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

const redis = isRedisConfigured
  ? new Redis({
      url: UPSTASH_URL,
      token: UPSTASH_TOKEN,
    })
  : null;

const CACHE_PREFIX = "gitscore:cache:";

export const CACHE_TTL = 900;

function normalizeKey(key: string): string {
  if (key.startsWith(CACHE_PREFIX)) return key;
  return `${CACHE_PREFIX}${key}`;
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  if (!isRedisConfigured || !redis) return null;
  try {
    const primary = await redis.get<T>(normalizeKey(key));
    if (primary !== null) return primary;
    return await redis.get<T>(key);
  } catch (err) {
    console.error("Redis read failure:", err);
    return null;
  }
}

export async function setCachedData(
  key: string,
  data: unknown,
  ttl = CACHE_TTL,
): Promise<void> {
  if (!isRedisConfigured || !redis) return;
  if (!Number.isFinite(ttl) || ttl <= 0) return;
  try {
    await redis.set(normalizeKey(key), data, { ex: Math.floor(ttl) });
  } catch (err) {
    console.error("Redis write failure:", err);
  }
}
