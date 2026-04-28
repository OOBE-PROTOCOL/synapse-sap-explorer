export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { ok, failFromUnknown } from '~/lib/api/http/envelope';
import { getRequestIdFromHeaders } from '~/lib/api/http/headers';
import { optionalPositiveInt } from '~/lib/api/http/params';
import { listPublicAgents } from '~/lib/api/public/agents';
import { resolveApiIdentityWithDb } from '~/lib/api/security/api-keys';
import { enforceRateLimitHybrid } from '~/lib/api/security/rate-limit';

export async function GET(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);

  try {
    const identity = await resolveApiIdentityWithDb(req.headers);
    const rate = await enforceRateLimitHybrid(identity.keyId ?? 'public', identity.tier);

    const capability = req.nextUrl.searchParams.get('capability')?.trim() || undefined;
    const protocol = req.nextUrl.searchParams.get('protocol')?.trim() || undefined;
    const limit = optionalPositiveInt(req.nextUrl.searchParams.get('limit'), 'limit', 200) ?? 50;

    const result = await listPublicAgents({ capability, protocol, limit });

    return ok(result.agents, {
      requestId,
      source: result.source,
      dataAgeMs: 0,
      rateLimit: rate,
      meta: {
        total: result.total,
        limit,
        hasMore: result.total > limit,
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

