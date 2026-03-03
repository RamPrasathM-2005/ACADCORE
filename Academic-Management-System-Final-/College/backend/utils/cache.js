import redis, { isRedisReady } from "../lib/redisClient.js";

const CACHE_PREFIX = process.env.CACHE_PREFIX || "acadcore";
const DEFAULT_TTL_SECONDS = Number(process.env.CACHE_DEFAULT_TTL_SECONDS || 120);

const sortObject = (value) => {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObject(value[key]);
        return acc;
      }, {});
  }
  return value;
};

export const makeCacheKey = (namespace, payload = {}) => {
  const normalized = JSON.stringify(sortObject(payload));
  return `${CACHE_PREFIX}:${namespace}:${normalized}`;
};

export const getCachedJson = async (key) => {
  if (!isRedisReady()) return null;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error(`Cache get failed for key ${key}:`, err.message);
    return null;
  }
};

export const setCachedJson = async (key, value, ttlSeconds = DEFAULT_TTL_SECONDS) => {
  if (!isRedisReady()) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.error(`Cache set failed for key ${key}:`, err.message);
  }
};

const resolveGetOrSetOptions = (ttlOrOptions) => {
  if (typeof ttlOrOptions === "number") {
    return { ttlSeconds: ttlOrOptions, onStatus: null };
  }
  if (ttlOrOptions && typeof ttlOrOptions === "object") {
    return {
      ttlSeconds: Number(ttlOrOptions.ttlSeconds || DEFAULT_TTL_SECONDS),
      onStatus: typeof ttlOrOptions.onStatus === "function" ? ttlOrOptions.onStatus : null,
    };
  }
  return { ttlSeconds: DEFAULT_TTL_SECONDS, onStatus: null };
};

export const getOrSetCache = async (key, fetcher, ttlOrOptions = DEFAULT_TTL_SECONDS) => {
  const { ttlSeconds, onStatus } = resolveGetOrSetOptions(ttlOrOptions);

  if (!isRedisReady()) {
    onStatus?.("BYPASS");
    console.log(`[CACHE BYPASS] ${key}`);
    return fetcher();
  }

  const cached = await getCachedJson(key);
  if (cached !== null) {
    onStatus?.("HIT");
    console.log(`[CACHE HIT] ${key}`);
    return cached;
  }

  onStatus?.("MISS");
  console.log(`[CACHE MISS -> DB] ${key}`);
  const fresh = await fetcher();
  await setCachedJson(key, fresh, ttlSeconds);
  return fresh;
};

export const invalidateCachePrefixes = async (prefixes = []) => {
  if (!isRedisReady() || !Array.isArray(prefixes) || prefixes.length === 0) return;

  try {
    for (const prefix of prefixes) {
      const match = `${CACHE_PREFIX}:${prefix}:*`;
      let cursor = "0";

      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", match, "COUNT", 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== "0");
    }
  } catch (err) {
    console.error("Cache invalidation failed:", err.message);
  }
};

export const ttl = {
  short: Number(process.env.CACHE_TTL_SHORT_SECONDS || 60),
  medium: Number(process.env.CACHE_TTL_MEDIUM_SECONDS || 300),
  long: Number(process.env.CACHE_TTL_LONG_SECONDS || 900),
};
