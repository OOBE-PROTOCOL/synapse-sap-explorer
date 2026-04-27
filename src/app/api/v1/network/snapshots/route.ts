export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { ok, failFromUnknown } from '~/lib/api/http/envelope';
import { getRequestIdFromHeaders } from '~/lib/api/http/headers';
import { optionalPositiveInt } from '~/lib/api/http/params';
import { getPublicSnapshots } from '~/lib/api/public/network';
import { resolveApiIdentityWithDb } from '~/lib/api/security/api-keys';
import { enforceRateLimitHybrid } from '~/lib/api/security/rate-limit';

export async function GET(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);

  try {
    const identity = await resolveApiIdentityWithDb(req.headers);
    const rate = await enforceRateLimitHybrid(identity.keyId ?? 'public', identity.tier);

    const days = optionalPositiveInt(req.nextUrl.searchParams.get('days'), 'days', 365) ?? 30;
    const result = await getPublicSnapshots(days);

    return ok(result.snapshots, {
      requestId,
      source: result.source,
      dataAgeMs: 0,
      rateLimit: rate,
      meta: {
        total: result.total,
        limit: days,
      },
      cacheControl: 'no-store, no-cache, must-revalidate',
    });
  } catch (error: unknown) {
    return failFromUnknown(error, {
      requestId,
      cacheControl: 'no-store, no-cache, must-revalidate',
    });
  }
}

