export type ApiTier = 'public' | 'free' | 'pro' | 'admin';

export const TIER_RANK: Record<ApiTier, number> = {
  public: 0,
  free: 1,
  pro: 2,
  admin: 3,
};

export function satisfiesTier(actual: ApiTier, required: ApiTier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[required];
}

export const DEFAULT_RATE_LIMITS: Record<ApiTier, { limitPerMinute: number }> = {
  public: { limitPerMinute: 30 },
  free: { limitPerMinute: 120 },
  pro: { limitPerMinute: 600 },
  admin: { limitPerMinute: 1200 },
};

