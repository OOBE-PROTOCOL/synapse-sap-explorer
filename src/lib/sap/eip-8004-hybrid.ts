/* ──────────────────────────────────────────────────────────
 * Hybrid EIP-8004 card builder.
 *
 * Single source of truth for `/agents/<sapPda>/eip-8004.json`.
 * Merges three independent registries into one canonical JSON:
 *
 *   1. SAP on-chain `AgentAccount` (always present — required)
 *   2. Metaplex Core `AgentIdentity` plugin discovery (optional)
 *   3. Metaplex public Agents Registry (api.metaplex.com, optional)
 *
 * The endpoint is meant to be the URL embedded inside the
 * `AgentIdentity` plugin so consumers see one card regardless of
 * which registry they came from. Eliminates the need for two
 * different EIP hosts.
 * ────────────────────────────────────────────────────────── */

import { PublicKey } from '@solana/web3.js';
import { getSapClient } from './discovery';
import {
  getMetaplexLinkSnapshot,
  type Eip8004RegistrationJson,
  type MetaplexLinkSnapshot,
} from './metaplex-link';
import {
  listRegistryAgentsForWallet,
  type MetaplexRegistryListResponse,
} from '~/lib/metaplex/registry';

export const SAP_PROGRAM_ID = 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';

export type HybridEip8004Card = {
  schema: 'https://eips.ethereum.org/EIPS/eip-8004';
  version: '1.0.0';
  type: 'AgentCard';
  name: string;
  description: string | null;
  synapseAgent: string;
  owner: string;
  issuedAt: string | null;
  updatedAt: string | null;
  agentUri: string | null;
  x402Endpoint: string | null;
  capabilities: Array<{
    id: string;
    version: string | null;
    protocolId: string | null;
    description: string | null;
  }>;
  protocols: string[];
  services: Array<{ id: string; type: string; url?: string }>;
  reputation: {
    score: number;
    totalFeedbacks: number;
    isActive: boolean;
  };
  sources: {
    sap: {
      program: string;
      pda: string;
      wallet: string;
      version: number | null;
    };
    metaplex: {
      linked: boolean;
      asset: string | null;
      agentIdentityUri: string | null;
      registration: Eip8004RegistrationJson | null;
      registry: {
        host: 'api.metaplex.com';
        network: string;
        agents: Array<{
          id: string;
          mintAddress: string;
          agentMetadataUri: string;
          name: string | null;
          description: string | null;
          image: string | null;
          walletAddress: string;
        }>;
        error: string | null;
      };
    };
  };
  /** Tier diagnostics — useful for debugging / monitoring. */
  diagnostics: {
    sap: 'ok';
    metaplexLink: 'ok' | 'error';
    metaplexRegistry: 'ok' | 'error';
    notes: string[];
  };
};

export class AgentNotFoundError extends Error {
  constructor(pda: string) {
    super(`Agent not found on-chain: ${pda}`);
    this.name = 'AgentNotFoundError';
  }
}

/* ── Helpers ───────────────────────────────────────────── */

function bnToNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') return Number(v) || 0;
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    try {
      return (v as { toNumber: () => number }).toNumber();
    } catch {
      return 0;
    }
  }
  return 0;
}

function bnToIso(v: unknown): string | null {
  const n = bnToNumber(v);
  if (!n || n < 0) return null;
  // SAP timestamps are unix seconds.
  return new Date(n * 1000).toISOString();
}

type RawCapability = {
  id?: string;
  version?: string | null;
  protocolId?: string | null;
  description?: string | null;
};

type RawAgentAccount = {
  wallet: PublicKey | string;
  name?: string;
  description?: string;
  agentUri?: string | null;
  x402Endpoint?: string | null;
  capabilities?: RawCapability[];
  protocols?: string[];
  reputationScore?: number;
  totalFeedbacks?: number;
  isActive?: boolean;
  version?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

/* ── Public builder ────────────────────────────────────── */

export async function buildHybridEip8004Card(
  sapPdaStr: string,
): Promise<HybridEip8004Card> {
  const sapPda = new PublicKey(sapPdaStr);
  const sap = getSapClient();

  // Anchor exposes typed account namespaces with a `.fetchNullable(pubkey)`
  // method that accepts a raw PDA — no wallet derivation required.
  const accounts = sap.program.account as unknown as {
    agentAccount: { fetchNullable: (pk: PublicKey) => Promise<RawAgentAccount | null> };
  };

  const agent = await accounts.agentAccount.fetchNullable(sapPda);
  if (!agent) throw new AgentNotFoundError(sapPdaStr);

  const wallet =
    typeof agent.wallet === 'string'
      ? agent.wallet
      : agent.wallet.toBase58();

  // Run Metaplex discovery in parallel — both are best-effort.
  const [snapResult, regResult] = await Promise.allSettled([
    getMetaplexLinkSnapshot(wallet),
    listRegistryAgentsForWallet(wallet),
  ]);

  const snap: MetaplexLinkSnapshot | null =
    snapResult.status === 'fulfilled' ? snapResult.value : null;
  const reg: MetaplexRegistryListResponse | null =
    regResult.status === 'fulfilled' ? regResult.value : null;

  const notes: string[] = [];
  if (snapResult.status === 'rejected') {
    notes.push(`metaplex-link discovery failed: ${String(snapResult.reason)}`);
  } else if (snap?.error) {
    notes.push(`metaplex-link diagnostic: ${snap.error}`);
  }
  if (regResult.status === 'rejected') {
    notes.push(`metaplex-registry fetch failed: ${String(regResult.reason)}`);
  } else if (reg?.error) {
    notes.push(`metaplex-registry diagnostic: ${reg.error}`);
  }

  // Merge services: x402 first, then unique services from MPL registration.
  const services: HybridEip8004Card['services'] = [];
  if (agent.x402Endpoint) {
    services.push({ id: 'x402', type: 'x402-payment', url: agent.x402Endpoint });
  }
  const mplRegistration = snap?.registration ?? null;
  const mplServices = (mplRegistration as { services?: unknown } | null)?.services;
  if (Array.isArray(mplServices)) {
    for (const raw of mplServices) {
      const svc = raw as { id?: unknown; type?: unknown; url?: unknown } | null;
      if (!svc) continue;
      const id = String(svc.id ?? svc.type ?? 'service');
      // Avoid duplicating x402 if already present.
      if (services.some((s) => s.id === id || (typeof svc.url === 'string' && s.url === svc.url))) continue;
      services.push({
        id,
        type: String(svc.type ?? 'service'),
        ...(svc.url ? { url: String(svc.url) } : {}),
      });
    }
  }

  const capabilities = (agent.capabilities ?? []).map((c) => ({
    id: String(c.id ?? ''),
    version: c.version ?? null,
    protocolId: c.protocolId ?? null,
    description: c.description ?? null,
  }));

  return {
    schema: 'https://eips.ethereum.org/EIPS/eip-8004',
    version: '1.0.0',
    type: 'AgentCard',
    name: agent.name ?? 'Unnamed agent',
    description: agent.description ?? null,
    synapseAgent: sapPdaStr,
    owner: wallet,
    issuedAt: bnToIso(agent.createdAt),
    updatedAt: bnToIso(agent.updatedAt),
    agentUri: agent.agentUri ?? null,
    x402Endpoint: agent.x402Endpoint ?? null,
    capabilities,
    protocols: agent.protocols ?? [],
    services,
    reputation: {
      score: agent.reputationScore ?? 0,
      totalFeedbacks: agent.totalFeedbacks ?? 0,
      isActive: !!agent.isActive,
    },
    sources: {
      sap: {
        program: SAP_PROGRAM_ID,
        pda: sapPdaStr,
        wallet,
        version: agent.version ?? null,
      },
      metaplex: {
        linked: !!snap?.linked,
        asset: snap?.asset ?? null,
        agentIdentityUri: snap?.agentIdentityUri ?? null,
        registration: mplRegistration as Eip8004RegistrationJson | null,
        registry: {
          host: 'api.metaplex.com',
          network: reg?.network ?? 'solana-mainnet',
          agents: (reg?.agents ?? []).map((a) => ({
            id: a.id,
            mintAddress: a.mintAddress,
            agentMetadataUri: a.agentMetadataUri,
            name: a.name,
            description: a.description,
            image: a.image,
            walletAddress: a.walletAddress,
          })),
          error: reg?.error ?? null,
        },
      },
    },
    diagnostics: {
      sap: 'ok',
      metaplexLink: snapResult.status === 'fulfilled' ? 'ok' : 'error',
      metaplexRegistry: regResult.status === 'fulfilled' ? 'ok' : 'error',
      notes,
    },
  };
}
