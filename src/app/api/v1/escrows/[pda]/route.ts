export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { ok, fail, failFromUnknown } from '~/lib/api/http/envelope';
import { getRequestIdFromHeaders } from '~/lib/api/http/headers';
import { getValidatedPathPublicKey } from '~/lib/api/http/params';
import { getPublicEscrowByPda } from '~/lib/api/public/escrows';
import { resolveApiIdentityWithDb } from '~/lib/api/security/api-keys';
import { enforceRateLimitHybrid } from '~/lib/api/security/rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pda: string }> },
) {
  const requestId = getRequestIdFromHeaders(req.headers);

  try {
    const identity = await resolveApiIdentityWithDb(req.headers);
    const rate = await enforceRateLimitHybrid(identity.keyId ?? 'public', identity.tier);

    const { pda } = await params;
    const normalizedPda = getValidatedPathPublicKey(pda, 'pda');

    const result = await getPublicEscrowByPda(normalizedPda);
    if (!result) {
      return fail('NOT_FOUND', 'Escrow not found', {
        requestId,
        cacheControl: 'no-store, no-cache, must-revalidate',
        rateLimit: rate,
      });
    }

    return ok(result.escrow, {
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

