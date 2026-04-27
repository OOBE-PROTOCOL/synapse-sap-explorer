import { PublicApiError } from '~/lib/api/http/errors';
import { DEFAULT_RATE_LIMITS } from './tiers';
import type { ApiTier } from './tiers';
import { incrementApiRateWindow } from '~/lib/db/queries';
import { isDbDown } from '~/db';

type RateState = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const _g = globalThis as unknown as {
  __publicApiRateState?: Map<string, RateState>;
};

function getStore(): Map<string, RateState> {
  if (!_g.__publicApiRateState) {
    _g.__publicApiRateState = new Map<string, RateState>();
  }
  return _g.__publicApiRateState;
}

export type RateLimitResult = {
  limit: number;
  remaining: number;
  reset: number;
};

export function enforceRateLimit(identityKey: string, tier: ApiTier): RateLimitResult {
  const now = Date.now();
  const limit = DEFAULT_RATE_LIMITS[tier].limitPerMinute;
  const store = getStore();
  const key = `${tier}:${identityKey}`;
  const current = store.get(key);

  if (!current || now >= current.resetAt) {
    const resetAt = now + WINDOW_MS;
    store.set(key, { count: 1, resetAt });
    return {
      limit,
      remaining: Math.max(limit - 1, 0),
      reset: Math.floor(resetAt / 1000),
    };
  }

  if (current.count >= limit) {
    const retryAfter = Math.max(Math.ceil((current.resetAt - now) / 1000), 1);
    throw new PublicApiError('RATE_LIMITED', 'Rate limit exceeded', retryAfter);
  }

  current.count += 1;
  store.set(key, current);

  return {
    limit,
    remaining: Math.max(limit - current.count, 0),
    reset: Math.floor(current.resetAt / 1000),
  };
}

export async function enforceRateLimitHybrid(identityKey: string, tier: ApiTier): Promise<RateLimitResult> {
  const now = Date.now();
  const limit = DEFAULT_RATE_LIMITS[tier].limitPerMinute;
  const windowStartMs = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const windowStart = new Date(windowStartMs);
  const reset = Math.floor((windowStartMs + WINDOW_MS) / 1000);

  if (!isDbDown()) {
    try {
      const nextCount = await incrementApiRateWindow(identityKey, tier, windowStart);
      if (nextCount > limit) {
        throw new PublicApiError('RATE_LIMITED', 'Rate limit exceeded', Math.max(reset - Math.floor(now / 1000), 1));
      }
      return {
        limit,
        remaining: Math.max(limit - nextCount, 0),
        reset,
      };
    } catch {
      // Missing table or transient DB error: use in-memory fallback.
    }
  }

  return enforceRateLimit(identityKey, tier);
}

