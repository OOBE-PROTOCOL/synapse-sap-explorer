/* ──────────────────────────────────────────────
 * GET /api/sap/vaults — Fetch all memory vault accounts
 *
 * Returns serialized vault data from program.account.memoryVault.all()
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllVaults } from '~/lib/sap/discovery';

export const GET = withSynapseError(async () => {
  const vaults = await findAllVaults();

  const serialized = vaults.map((v) => {
    const d = v.account;
    return {
      pda: v.pda.toBase58(),
      agent: d.agent?.toBase58?.() ?? String(d.agent ?? ''),
      wallet: d.wallet?.toBase58?.() ?? String(d.wallet ?? ''),
      totalSessions: d.totalSessions ?? 0,
      totalInscriptions: d.totalInscriptions?.toString?.() ?? '0',
      totalBytesInscribed: d.totalBytesInscribed?.toString?.() ?? '0',
      createdAt: d.createdAt?.toString?.() ?? '0',
      nonceVersion: d.nonceVersion ?? 0,
      protocolVersion: d.protocolVersion ?? 0,
    };
  });

  return synapseResponse({ vaults: serialized, total: serialized.length });
});
