export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { ok, failFromUnknown } from '~/lib/api/http/envelope';
import { getRequestIdFromHeaders } from '~/lib/api/http/headers';
import { getPublicStatus } from '~/lib/api/public/status';
import { resolveApiIdentityWithDb } from '~/lib/api/security/api-keys';
import { enforceRateLimitHybrid } from '~/lib/api/security/rate-limit';

export async function GET(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);

  try {
    const identity = await resolveApiIdentityWithDb(req.headers);
    const rate = await enforceRateLimitHybrid(identity.keyId ?? 'public', identity.tier);
    const status = await getPublicStatus();
    return ok(status, {
      requestId,
      source: 'internal',
      dataAgeMs: 0,
      cacheControl: 'no-store, no-cache, must-revalidate',
      rateLimit: rate,
      meta: {
        warnings: status.status === 'degraded' ? ['status:degraded'] : undefined,
      },
    });
  } catch (error: unknown) {
    return failFromUnknown(error, {
      requestId,
      cacheControl: 'no-store, no-cache, must-revalidate',
    });
  }
}

