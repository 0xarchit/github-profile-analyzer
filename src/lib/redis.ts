import { Redis } from "@upstash/redis";
import { sendTelegramAlert } from "./telegram-alert";

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
  const normalizedKey = normalizeKey(key);
  if (!isRedisConfigured || !redis) {
    console.log("[CACHE] Redis not configured - skipping get", {
      key,
      normalizedKey,
    });
    return null;
  }
  try {
    console.log("[CACHE] Attempting to read from cache", {
      key,
      normalizedKey,
    });
    const primary = await redis.get<T>(normalizedKey);
    if (primary !== null) {
      console.log("[CACHE] Cache hit on primary key", { key, normalizedKey });
      return primary;
    }
    console.log("[CACHE] Primary cache miss, trying fallback", { key });
    const fallback = await redis.get<T>(key);
    if (fallback !== null) {
      console.log("[CACHE] Cache hit on fallback key", { key });
      return fallback;
    }
    console.log("[CACHE] Complete cache miss", { key });
    return null;
  } catch (err) {
    console.error("[CACHE] Redis read failure", {
      key,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    await sendTelegramAlert({
      source: "REDIS_READ",
      message: "Redis read failure",
      error: err,
      context: { key, normalizedKey },
    });
    return null;
  }
}

export async function setCachedData(
  key: string,
  data: unknown,
  ttl = CACHE_TTL,
): Promise<void> {
  const normalizedKey = normalizeKey(key);
  if (!isRedisConfigured || !redis) {
    console.log("[CACHE] Redis not configured - skipping set", {
      key,
      normalizedKey,
      ttl,
    });
    return;
  }
  if (!Number.isFinite(ttl) || ttl <= 0) {
    console.log("[CACHE] Invalid TTL - skipping set", { key, ttl });
    return;
  }
  try {
    console.log("[CACHE] Writing to cache", {
      key: normalizedKey,
      ttl,
      dataSize: JSON.stringify(data).length,
    });
    await redis.set(normalizeKey(key), data, { ex: Math.floor(ttl) });
    console.log("[CACHE] Cache write successful", { key: normalizedKey, ttl });
  } catch (err) {
    console.error("[CACHE] Redis write failure", {
      key,
      ttl,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    await sendTelegramAlert({
      source: "REDIS_WRITE",
      message: "Redis write failure",
      error: err,
      context: { key, normalizedKey, ttl },
    });
  }
}
