export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/attestations — Fetch all attestation accounts
 *
 * Data flow: SWR cache → DB → RPC → write-back
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllAttestations, serialize } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllAttestations, upsertAttestations } from '~/lib/db/queries';
import { isDbDown, markDbDown } from '~/db';
import { dbAttestationToApi, apiAttestationToDb } from '~/lib/db/mappers';
import type { ApiAttestation } from '~/types';

async function rpcFetchAttestations() {
  const attestations = await findAllAttestations();
  const serialized = attestations.map((a) => ({
    pda: a.pda.toBase58(),
    ...serialize(a.account),
  })) as ApiAttestation[];
  upsertAttestations(serialized.map(apiAttestationToDb)).catch((e) =>
    console.warn('[attestations] DB write failed:', (e as Error).message),
  );
  return { attestations: serialized, total: serialized.length };
}

export const GET = withSynapseError(async () => {
  const cached = peek<{ attestations: ApiAttestation[]; total: number }>('attestations');
  if (cached && cached.attestations?.length > 0) {
    swr('attestations', rpcFetchAttestations, { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  if (!isDbDown()) try {
    const dbRows = await selectAllAttestations();
    if (dbRows.length > 0) {
      const result = { attestations: dbRows.map(dbAttestationToApi), total: dbRows.length };
      swr('attestations', rpcFetchAttestations, { ttl: 60_000, swr: 300_000 }).catch(() => {});
      return synapseResponse(result);
    }
  } catch (e) {
    console.warn('[attestations] DB read failed:', (e as Error).message);
    markDbDown();
  }

  const data = await rpcFetchAttestations();
  swr('attestations', () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
