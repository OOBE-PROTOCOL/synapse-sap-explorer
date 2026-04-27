export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { ok, failFromUnknown } from '~/lib/api/http/envelope';
import { getRequestIdFromHeaders } from '~/lib/api/http/headers';
import { getValidatedPathPublicKey } from '~/lib/api/http/params';
import { lookupPublicAddress } from '~/lib/api/public/address';
import { resolveApiIdentityWithDb } from '~/lib/api/security/api-keys';
import { enforceRateLimitHybrid } from '~/lib/api/security/rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const requestId = getRequestIdFromHeaders(req.headers);

  try {
    const identity = await resolveApiIdentityWithDb(req.headers);
    const rate = await enforceRateLimitHybrid(identity.keyId ?? 'public', identity.tier);

    const { address } = await params;
    const normalizedAddress = getValidatedPathPublicKey(address, 'address');

    const result = await lookupPublicAddress(normalizedAddress);

    return ok(result.result, {
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

