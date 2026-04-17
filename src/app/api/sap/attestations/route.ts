export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/attestations — Fetch all attestation accounts
 *
 * Data flow: SWR cache → DB → RPC → write-back
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllAttestations } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllAttestations, upsertAttestations } from '~/lib/db/queries';
import { dbAttestationToApi, apiAttestationToDb } from '~/lib/db/mappers';

async function rpcFetchAttestations() {
  const attestations = await findAllAttestations();
  const serialized = attestations.map((a) => {
    const d = a.account;
    return {
      pda: a.pda.toBase58(),
      agent: d.agent?.toBase58?.() ?? String(d.agent ?? ''),
      attester: d.attester?.toBase58?.() ?? String(d.attester ?? ''),
      attestationType: d.attestationType ?? '',
      isActive: d.isActive ?? false,
      createdAt: d.createdAt?.toString?.() ?? '0',
      expiresAt: d.expiresAt?.toString?.() ?? '0',
      metadataHash: d.metadataHash
        ? Buffer.from(d.metadataHash).toString('hex')
        : '',
    };
  });
  upsertAttestations(serialized.map(apiAttestationToDb)).catch((e) =>
    console.warn('[attestations] DB write failed:', (e as Error).message),
  );
  return { attestations: serialized, total: serialized.length };
}

export const GET = withSynapseError(async () => {
  const cached = peek<any>('attestations');
  if (cached && cached.attestations?.length > 0) {
    swr('attestations', rpcFetchAttestations, { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  try {
    const dbRows = await selectAllAttestations();
    if (dbRows.length > 0) {
      const result = { attestations: dbRows.map(dbAttestationToApi), total: dbRows.length };
      swr('attestations', rpcFetchAttestations, { ttl: 60_000, swr: 300_000 }).catch(() => {});
      return synapseResponse(result);
    }
  } catch (e) {
    console.warn('[attestations] DB read failed:', (e as Error).message, '| cause:', (e as any).cause?.message ?? 'none');
  }

  const data = await rpcFetchAttestations();
  swr('attestations', () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
