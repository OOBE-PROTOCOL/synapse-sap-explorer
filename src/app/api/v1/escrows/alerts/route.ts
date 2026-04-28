export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { ok, failFromUnknown } from '~/lib/api/http/envelope';
import { getRequestIdFromHeaders } from '~/lib/api/http/headers';
import { optionalPositiveInt } from '~/lib/api/http/params';
import { getPublicEscrowAlerts } from '~/lib/api/public/analytics';
import { resolveApiIdentityWithDb } from '~/lib/api/security/api-keys';
import { enforceRateLimitHybrid } from '~/lib/api/security/rate-limit';

export async function GET(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);

  try {
    const identity = await resolveApiIdentityWithDb(req.headers);
    const rate = await enforceRateLimitHybrid(identity.keyId ?? 'public', identity.tier);

    const hours = optionalPositiveInt(req.nextUrl.searchParams.get('hours'), 'hours', 720) ?? 48;
    const result = await getPublicEscrowAlerts(hours);

    return ok(
      {
        expiringEscrows: result.expiringEscrows,
        lowBalanceEscrows: result.lowBalanceEscrows,
      },
      {
        requestId,
        source: result.source,
        dataAgeMs: 0,
        rateLimit: rate,
        meta: {
          total: result.total,
          limit: hours,
        },
        cacheControl: 'no-store, no-cache, must-revalidate',
      },
    );
  } catch (error: unknown) {
    return failFromUnknown(error, {
      requestId,
      cacheControl: 'no-store, no-cache, must-revalidate',
    });
  }
}

