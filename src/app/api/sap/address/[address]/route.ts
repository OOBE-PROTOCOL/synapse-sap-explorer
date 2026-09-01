export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ──────────────────────────────────────────────
 * GET /api/sap/address/[address] — Universal address lookup
 *
 * 1) SWR in-memory cache (30s fresh, 5min stale)
 * 2) DB first for entity lookups → RPC fallback only for balance/account info
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { swr } from '~/lib/cache';
import {
  selectAddressEntities,
} from '~/lib/db/queries';
import {
  dbAgentToApi,
  dbToolToApi,
  dbEscrowToApi,
  dbAttestationToApi,
  dbFeedbackToApi,
  dbVaultToApi,
} from '~/lib/db/mappers';
import { isDbDown, markDbDown } from '~/db';
import type { RpcSignatureInfo, TransactionError } from '~/types/indexer';
import { getSynapseRpcConfig } from '~/lib/sap/rpc-config';

/** Minimal shape shared by DB-mapped API types and RPC-serialized entities. */
type EntityRecord = Record<string, unknown> & { pda: string };

type RawAccountInfo = {
  owner?: string;
  executable?: boolean;
  rentEpoch?: number | string;
  data?: string | [string, string];
};

const BASE58_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function rpcCall<T>(
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
  method: string,
  params: unknown[],
): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: rpcHeaders,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result as T;
}

async function rawGetAccountInfo(
  address: string,
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
): Promise<RawAccountInfo | null> {
  const result = await rpcCall<{ value: RawAccountInfo | null }>(
    rpcUrl,
    rpcHeaders,
    'getAccountInfo',
    [address, { encoding: 'base64' }],
  );
  return result?.value ?? null;
}

async function rawGetBalance(
  address: string,
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
): Promise<number> {
  const result = await rpcCall<{ value?: number }>(
    rpcUrl,
    rpcHeaders,
    'getBalance',
    [address],
  );
  return Number(result?.value ?? 0);
}

async function rawGetSignatures(
  address: string,
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
  limit = 20,
): Promise<RpcSignatureInfo[]> {
  const rows = await rpcCall<Array<{
    signature: string;
    slot: number;
    blockTime: number | null;
    err: unknown;
    memo: string | null;
  }>>(
    rpcUrl,
    rpcHeaders,
    'getSignaturesForAddress',
    [address, { limit }],
  );
  return (rows ?? []).map((s) => ({
    signature: s.signature,
    slot: s.slot,
    blockTime: s.blockTime ?? null,
    err: s.err as TransactionError,
    memo: s.memo ?? null,
  }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  try {
    const { address } = await params;
    if (!BASE58_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const result = await swr(`address:${address}`, async () => {
    const { url: rpcUrl, headers: rpcHeaders } = getSynapseRpcConfig();

    // 1) Account info + balance (always from RPC — lightweight)
    const [accountInfo, balance] = await Promise.all([
      rawGetAccountInfo(address, rpcUrl, rpcHeaders).catch(() => null),
      rawGetBalance(address, rpcUrl, rpcHeaders).catch(() => 0),
    ]);

      // 2) Targeted DB entity lookup. This route is used by every unknown
      // address link, so it must never read all explorer tables per request.
      let agentsData: EntityRecord[] = [];
      let toolsData: EntityRecord[] = [];
      let escrowsData: EntityRecord[] = [];
      let attestationsData: EntityRecord[] = [];
      let feedbacksData: EntityRecord[] = [];
      let vaultsData: EntityRecord[] = [];
      let lookupSource = 'db-skipped';

      if (!isDbDown()) {
        try {
          const dbEntities = await selectAddressEntities(address);
          agentsData = dbEntities.agents.map(dbAgentToApi);
          toolsData = dbEntities.tools.map(dbToolToApi);
          escrowsData = dbEntities.escrows.map(dbEscrowToApi);
          attestationsData = dbEntities.attestations.map(dbAttestationToApi);
          feedbacksData = dbEntities.feedbacks.map(dbFeedbackToApi);
          vaultsData = dbEntities.vaults.map(dbVaultToApi);
          lookupSource = 'db-targeted';
        } catch (e) {
          console.warn(`[address/${address}] DB lookup failed:`, (e as Error).message);
          markDbDown();
          lookupSource = 'db-error';
        }
      }

      // Match address against known entities
      const matchPda = (entity: EntityRecord) => entity.pda === address;
      const matchWallet = (entity: EntityRecord) => {
        const w = (entity.identity as Record<string, unknown> | undefined)?.wallet ?? entity.wallet;
        return w === address;
      };

      const asAgentPda = agentsData.find(matchPda);
      const asAgentWallet = agentsData.find(matchWallet);
      const asToolPda = toolsData.find(matchPda);
      const asEscrowPda = escrowsData.find(matchPda);
      const asAttestationPda = attestationsData.find(matchPda);
      const asFeedbackPda = feedbacksData.find(matchPda);
      const asVaultPda = vaultsData.find(matchPda);

      // Related entities
      const relatedTools = toolsData.filter((t) => {
        const agent = t.agent ?? (t.account as EntityRecord | undefined)?.agent;
        return agent === address || t.agentPda === address;
      });
      const relatedEscrows = escrowsData.filter((e) => {
        const a = (e.account as EntityRecord | undefined) ?? e;
        return e.pda === address || a.agentPda === address || a.depositor === address ||
          a.agentWallet === address || a.agent === address;
      });
      const relatedAttestations = attestationsData.filter((a) => {
        const acc = (a.account as EntityRecord | undefined) ?? a;
        return acc.agentPda === address || acc.attester === address || acc.agent === address;
      });
      const relatedFeedbacks = feedbacksData.filter((f) => {
        const acc = (f.account as EntityRecord | undefined) ?? f;
        return acc.agentPda === address || acc.reviewer === address || acc.agent === address;
      });

      // 4) Recent transactions (lightweight RPC call)
      let recentTxs: RpcSignatureInfo[] = [];
      try {
        recentTxs = await rawGetSignatures(address, rpcUrl, rpcHeaders, 20);
      } catch (e) { console.warn(`[address/${address}] tx history fetch failed:`, (e as Error).message); }

      const entityType = asAgentPda ? 'agent' :
        asToolPda ? 'tool' :
        asEscrowPda ? 'escrow' :
        asAttestationPda ? 'attestation' :
        asFeedbackPda ? 'feedback' :
        asVaultPda ? 'vault' :
        asAgentWallet ? 'wallet' :
        accountInfo ? 'account' :
        'unknown';

      return {
        address,
        entityType,
        balance,
        owner: accountInfo?.owner ?? null,
        executable: accountInfo?.executable ?? false,
        rentEpoch: accountInfo?.rentEpoch ?? null,
        dataSize: Array.isArray(accountInfo?.data)
          ? Buffer.from(accountInfo.data[0] ?? '', 'base64').length
          : typeof accountInfo?.data === 'string'
            ? accountInfo.data.length
            : 0,
        agent: asAgentPda ?? asAgentWallet ?? null,
        tool: asToolPda ?? null,
        escrow: asEscrowPda ?? null,
        attestation: asAttestationPda ?? null,
        feedback: asFeedbackPda ?? null,
        vault: asVaultPda ?? null,
        relatedTools,
        relatedEscrows,
        relatedAttestations,
        relatedFeedbacks,
        recentTransactions: recentTxs,
        source: lookupSource,
      };
    }, { ttl: 30_000, swr: 300_000 });

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[address]', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch address data' },
      { status: 500 },
    );
  }
}
