export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { ok, fail, failFromUnknown } from '~/lib/api/http/envelope';
import { getRequestIdFromHeaders } from '~/lib/api/http/headers';
import { requiredString } from '~/lib/api/http/params';
import { getPublicTransactionBySignature } from '~/lib/api/public/transactions';
import { resolveApiIdentityWithDb } from '~/lib/api/security/api-keys';
import { enforceRateLimitHybrid } from '~/lib/api/security/rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ signature: string }> },
) {
  const requestId = getRequestIdFromHeaders(req.headers);

  try {
    const identity = await resolveApiIdentityWithDb(req.headers);
    const rate = await enforceRateLimitHybrid(identity.keyId ?? 'public', identity.tier);

    const { signature } = await params;
    const sig = requiredString(signature, 'signature');

    const result = await getPublicTransactionBySignature(sig);
    if (!result) {
      return fail('NOT_FOUND', 'Transaction not found', {
        requestId,
        cacheControl: 'no-store, no-cache, must-revalidate',
        rateLimit: rate,
      });
    }

    return ok(result.detail, {
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

