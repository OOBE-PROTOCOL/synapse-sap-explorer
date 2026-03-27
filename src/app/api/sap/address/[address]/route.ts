export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/address/[address] — Universal address lookup
 *
 * 1) SWR in-memory cache (30s fresh, 5min stale)
 * 2) DB first for entity lookups → RPC fallback only for balance/account info
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import {
  findAllAgents,
  findAllTools,
  findAllEscrows,
  findAllAttestations,
  findAllFeedbacks,
  findAllVaults,
  serializeDiscoveredAgent,
  serializeDiscoveredTool,
  serialize,
  getSynapseConnection,
} from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';
import {
  selectAllAgents,
  selectAllTools,
  selectAllEscrows,
  selectAllAttestations,
  selectAllFeedbacks,
  selectAllVaults,
} from '~/lib/db/queries';
import {
  dbAgentToApi,
  dbToolToApi,
  dbEscrowToApi,
  dbAttestationToApi,
  dbFeedbackToApi,
  dbVaultToApi,
} from '~/lib/db/mappers';

export async function GET(
  _req: Request,
  { params }: { params: { address: string } },
) {
  try {
    const address = params.address;

    const result = await swr(`address:${address}`, async () => {
      const synConn = getSynapseConnection();
      const pubkey = new PublicKey(address);

      // 1) Account info + balance (always from RPC — lightweight)
      const [accountInfo, balance] = await Promise.all([
        synConn.getAccountInfo(pubkey).catch(() => null),
        synConn.getBalance(pubkey).catch(() => 0),
      ]);

      // 2) Try DB first for entity lookups (instant)
      let agentsData: any[] = [];
      let toolsData: any[] = [];
      let escrowsData: any[] = [];
      let attestationsData: any[] = [];
      let feedbacksData: any[] = [];
      let vaultsData: any[] = [];
      let fromDb = false;

      try {
        const [dbAgents, dbTools, dbEscrows, dbAtts, dbFbs, dbVaults] = await Promise.all([
          selectAllAgents(),
          selectAllTools(),
          selectAllEscrows(),
          selectAllAttestations(),
          selectAllFeedbacks(),
          selectAllVaults(),
        ]);
        if (dbAgents.length > 0) {
          fromDb = true;
          agentsData = dbAgents.map(dbAgentToApi);
          toolsData = dbTools.map(dbToolToApi);
          escrowsData = dbEscrows.map(dbEscrowToApi);
          attestationsData = dbAtts.map(dbAttestationToApi);
          feedbacksData = dbFbs.map(dbFeedbackToApi);
          vaultsData = dbVaults.map(dbVaultToApi);
        }
      } catch { /* DB unavailable */ }

      // 3) RPC fallback if DB empty
      if (!fromDb) {
        const [rpcAgents, rpcTools, rpcEscrows, rpcAtts, rpcFbs, rpcVaults] = await Promise.all([
          findAllAgents().catch(() => []),
          findAllTools().catch(() => []),
          findAllEscrows().catch(() => []),
          findAllAttestations().catch(() => []),
          findAllFeedbacks().catch(() => []),
          findAllVaults().catch(() => []),
        ]);
        agentsData = rpcAgents.map(serializeDiscoveredAgent);
        toolsData = rpcTools.map(serializeDiscoveredTool);
        escrowsData = rpcEscrows.map((e) => ({ pda: e.pda.toBase58(), account: serialize(e.account) }));
        attestationsData = rpcAtts.map((a) => ({ pda: a.pda.toBase58(), account: serialize(a.account) }));
        feedbacksData = rpcFbs.map((f) => ({ pda: f.pda.toBase58(), account: serialize(f.account) }));
        vaultsData = rpcVaults.map((v) => ({ pda: v.pda.toBase58(), account: serialize(v.account) }));
      }

      // Match address against known entities
      const matchPda = (entity: any) => entity.pda === address;
      const matchWallet = (entity: any) => {
        const w = entity.identity?.wallet ?? entity.wallet;
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
        const agent = t.agent ?? t.account?.agent;
        return agent === address || t.agentPda === address;
      });
      const relatedEscrows = escrowsData.filter((e) => {
        const a = e.account ?? e;
        return e.pda === address || a.agentPda === address || a.depositor === address ||
          a.agentWallet === address || a.agent === address;
      });
      const relatedAttestations = attestationsData.filter((a) => {
        const acc = a.account ?? a;
        return acc.agentPda === address || acc.attester === address || acc.agent === address;
      });
      const relatedFeedbacks = feedbacksData.filter((f) => {
        const acc = f.account ?? f;
        return acc.agentPda === address || acc.reviewer === address || acc.agent === address;
      });

      // 4) Recent transactions (lightweight RPC call)
      let recentTxs: any[] = [];
      try {
        const sigs = await synConn.getSignaturesForAddress(pubkey, { limit: 20 });
        recentTxs = sigs.map((s) => ({
          signature: s.signature,
          slot: s.slot,
          blockTime: s.blockTime ?? null,
          err: s.err !== null,
          memo: s.memo ?? null,
        }));
      } catch { /* ignore */ }

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
        owner: accountInfo?.owner?.toString?.() ?? null,
        executable: accountInfo?.executable ?? false,
        rentEpoch: accountInfo?.rentEpoch ?? null,
        dataSize: accountInfo?.data
          ? (accountInfo.data as any).length ?? 0
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
      };
    }, { ttl: 30_000, swr: 300_000 });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[address]', err);
    return NextResponse.json(
      { error: err.message ?? 'Failed to fetch address data' },
      { status: 500 },
    );
  }
}
