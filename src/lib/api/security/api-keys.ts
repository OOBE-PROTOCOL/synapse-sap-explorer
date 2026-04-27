import type { ApiTier } from './tiers';
import { createHash } from 'crypto';
import { selectApiKeyByHash, touchApiKeyLastUsed } from '~/lib/db/queries';
import { isDbDown } from '~/db';

export type ApiIdentity = {
  tier: ApiTier;
  keyId: string | null;
};

function parseCsvEnv(key: string): string[] {
  const raw = process.env[key] ?? '';
  return raw.split(',').map((v: string) => v.trim()).filter(Boolean);
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

function resolveTierByKey(apiKey: string): ApiTier | null {
  const pro = new Set(parseCsvEnv('PUBLIC_API_PRO_KEYS'));
  if (pro.has(apiKey)) return 'pro';

  const free = new Set(parseCsvEnv('PUBLIC_API_FREE_KEYS'));
  if (free.has(apiKey)) return 'free';

  return null;
}

export function resolveApiIdentity(headers: Headers): ApiIdentity {
  const apiKey = headers.get('x-api-key')?.trim();
  if (!apiKey) return { tier: 'public', keyId: null };

  const tier = resolveTierByKey(apiKey);
  if (!tier) return { tier: 'public', keyId: null };

  return {
    tier,
    keyId: apiKey.slice(0, 8),
  };
}

export async function resolveApiIdentityWithDb(headers: Headers): Promise<ApiIdentity> {
  const apiKey = headers.get('x-api-key')?.trim();
  if (!apiKey) return { tier: 'public', keyId: null };

  if (!isDbDown()) {
    try {
      const keyHash = hashApiKey(apiKey);
      const row = await selectApiKeyByHash(keyHash);
      if (row && row.isActive) {
        touchApiKeyLastUsed(row.id).catch(() => {});
        return {
          tier: row.tier,
          keyId: row.keyPrefix || apiKey.slice(0, 8),
        };
      }
    } catch {
      // Table may not exist yet in environments where migration has not been run.
    }
  }

  return resolveApiIdentity(headers);
}

