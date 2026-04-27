export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { ok, failFromUnknown } from '~/lib/api/http/envelope';
import { getRequestIdFromHeaders } from '~/lib/api/http/headers';
import { optionalPositiveInt } from '~/lib/api/http/params';
import { PublicApiError } from '~/lib/api/http/errors';
import { getPublicVolumeDaily } from '~/lib/api/public/analytics';
import { resolveApiIdentityWithDb } from '~/lib/api/security/api-keys';
import { enforceRateLimitHybrid } from '~/lib/api/security/rate-limit';

export async function GET(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);

  try {
    const identity = await resolveApiIdentityWithDb(req.headers);
    const rate = await enforceRateLimitHybrid(identity.keyId ?? 'public', identity.tier);

    const bucket = req.nextUrl.searchParams.get('bucket') ?? 'daily';
    if (bucket !== 'daily' && bucket !== 'hourly') {
      throw new PublicApiError('INVALID_PARAM', 'bucket must be "daily" or "hourly"');
    }

    const days = optionalPositiveInt(req.nextUrl.searchParams.get('days'), 'days', 90) ?? 30;
    const hours = optionalPositiveInt(req.nextUrl.searchParams.get('hours'), 'hours', 168) ?? 24;

    const result = await getPublicVolumeDaily({
      bucket,
      days,
      hours,
    });

    return ok(result.payload, {
      requestId,
      source: result.source,
      dataAgeMs: 0,
      rateLimit: rate,
      cacheControl: 'no-store, no-cache, must-revalidate',
    });
  } catch (error: unknown) {
    return failFromUnknown(error, {
      requestId,
      cacheControl: 'no-store, no-cache, must-revalidate',
    });
  }
}

