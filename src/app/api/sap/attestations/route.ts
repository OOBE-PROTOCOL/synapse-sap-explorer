/* ──────────────────────────────────────────────
 * GET /api/sap/attestations — Fetch all attestation accounts
 *
 * Returns serialized attestation data from program.account.agentAttestation.all()
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllAttestations } from '~/lib/sap/discovery';

export const GET = withSynapseError(async () => {
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

  return synapseResponse({ attestations: serialized, total: serialized.length });
});
