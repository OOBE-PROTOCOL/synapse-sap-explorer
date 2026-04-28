export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { ok, failFromUnknown } from '~/lib/api/http/envelope';
import { getRequestIdFromHeaders } from '~/lib/api/http/headers';
import { computeHasMore, parsePagePagination } from '~/lib/api/http/pagination';
import { listPublicTransactions } from '~/lib/api/public/transactions';
import { resolveApiIdentityWithDb } from '~/lib/api/security/api-keys';
import { enforceRateLimitHybrid } from '~/lib/api/security/rate-limit';

export async function GET(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);

  try {
    const identity = await resolveApiIdentityWithDb(req.headers);
    const rate = await enforceRateLimitHybrid(identity.keyId ?? 'public', identity.tier);

    const { page, perPage, offset } = parsePagePagination(req.nextUrl.searchParams, {
      page: 1,
      perPage: 25,
      maxPerPage: 200,
    });

    const result = await listPublicTransactions({
      perPage,
      offset,
    });

    return ok(result.transactions, {
      requestId,
      source: result.source,
      dataAgeMs: 0,
      rateLimit: rate,
      meta: {
        total: result.total,
        page,
        limit: perPage,
        hasMore: computeHasMore(result.total, offset, perPage),
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

