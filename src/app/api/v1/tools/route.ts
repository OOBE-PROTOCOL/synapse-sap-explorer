export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { ok, failFromUnknown } from '~/lib/api/http/envelope';
import { getRequestIdFromHeaders } from '~/lib/api/http/headers';
import { listPublicTools } from '~/lib/api/public/tools';
import { resolveApiIdentityWithDb } from '~/lib/api/security/api-keys';
import { enforceRateLimitHybrid } from '~/lib/api/security/rate-limit';

export async function GET(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);

  try {
    const identity = await resolveApiIdentityWithDb(req.headers);
    const rate = await enforceRateLimitHybrid(identity.keyId ?? 'public', identity.tier);

    const category = req.nextUrl.searchParams.get('category')?.trim() || undefined;
    const result = await listPublicTools({ category });

    return ok(
      {
        tools: result.tools,
        categories: result.categories,
      },
      {
        requestId,
        source: result.source,
        dataAgeMs: 0,
        rateLimit: rate,
        meta: {
          total: result.total,
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

