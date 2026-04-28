import { PublicKey } from '@solana/web3.js';
import { isDbDown } from '~/db';
import {
  selectAllAgents,
  selectAllAttestations,
  selectAllEscrows,
  selectAllFeedbacks,
  selectAllTools,
  selectAllVaults,
} from '~/lib/db/queries';
import {
  dbAgentToApi,
  dbAttestationToApi,
  dbEscrowToApi,
  dbFeedbackToApi,
  dbToolToApi,
  dbVaultToApi,
} from '~/lib/db/mappers';
import { getSynapseConnection } from '~/lib/sap/discovery';
import type { PublicDataSource } from '~/types';

export type PublicAddressLookupResult = {
  result: Record<string, unknown>;
  source: PublicDataSource;
};

export async function lookupPublicAddress(address: string): Promise<PublicAddressLookupResult> {
  let solBalance = 0;
  try {
    const conn = getSynapseConnection();
    solBalance = await conn.getBalance(new PublicKey(address));
  } catch {
    solBalance = 0;
  }

  if (isDbDown()) {
    return {
      result: {
        address,
        entityType: 'unknown',
        balance: solBalance,
        relatedTools: [],
        relatedEscrows: [],
        relatedAttestations: [],
        relatedFeedbacks: [],
      },
      source: 'rpc',
    };
  }

  const [agents, tools, escrows, attestations, feedbacks, vaults] = await Promise.all([
    selectAllAgents(),
    selectAllTools(),
    selectAllEscrows(),
    selectAllAttestations(),
    selectAllFeedbacks(),
    selectAllVaults(),
  ]);

  const agentsData = agents.map((r) => dbAgentToApi(r));
  const toolsData = tools.map((r) => dbToolToApi(r));
  const escrowsData = escrows.map((r) => dbEscrowToApi(r));
  const attData = attestations.map((r) => dbAttestationToApi(r));
  const fbData = feedbacks.map((r) => dbFeedbackToApi(r));
  const vaultData = vaults.map((r) => dbVaultToApi(r));

  const asAgent = agentsData.find((a) => a.pda === address || a.identity?.wallet === address) ?? null;
  const asTool = toolsData.find((t) => t.pda === address) ?? null;
  const asEscrow = escrowsData.find((e) => e.pda === address) ?? null;
  const asAtt = attData.find((a) => a.pda === address) ?? null;
  const asFb = fbData.find((f) => f.pda === address) ?? null;
  const asVault = vaultData.find((v) => v.pda === address) ?? null;

  const relatedTools = toolsData.filter((t) => (t.descriptor?.agent as string | undefined) === address);
  const relatedEscrows = escrowsData.filter((e) =>
    e.pda === address || e.agent === address || e.depositor === address || e.agentWallet === address,
  );
  const relatedAttestations = attData.filter((a) => a.agent === address || a.attester === address);
  const relatedFeedbacks = fbData.filter((f) => f.agent === address || f.reviewer === address);

  const entityType = asAgent
    ? 'agent'
    : asTool
      ? 'tool'
      : asEscrow
        ? 'escrow'
        : asAtt
          ? 'attestation'
          : asFb
            ? 'feedback'
            : asVault
              ? 'vault'
              : 'unknown';

  return {
    result: {
      address,
      entityType,
      balance: solBalance,
      agent: asAgent,
      tool: asTool,
      escrow: asEscrow,
      attestation: asAtt,
      feedback: asFb,
      vault: asVault,
      relatedTools,
      relatedEscrows,
      relatedAttestations,
      relatedFeedbacks,
    },
    source: 'db',
  };
}

