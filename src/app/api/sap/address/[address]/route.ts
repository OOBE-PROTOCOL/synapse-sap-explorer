/* ──────────────────────────────────────────────
 * GET /api/sap/address/[address] — Universal address lookup
 *
 * Identifies what an on-chain address is:
 * agent PDA, tool PDA, escrow PDA, wallet, etc.
 * Returns all related entities + recent transactions.
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

export async function GET(
  _req: Request,
  { params }: { params: { address: string } },
) {
  try {
  const address = params.address;

  const synConn = getSynapseConnection();
  const pubkey = new PublicKey(address);

  // 1) Get account info (via Synapse — account reads work)
  let accountInfo: any = null;
  try {
    accountInfo = await synConn.getAccountInfo(pubkey);
  } catch { /* invalid address */ }

  // 2) Get SOL balance
  let balance: number = 0;
  try {
    balance = await synConn.getBalance(pubkey);
  } catch { /* ignore */ }

  // 3) Check if it's a known SAP entity
  const [agents, tools, escrows, attestations, feedbacks, vaults] = await Promise.all([
    findAllAgents().catch(() => []),
    findAllTools().catch(() => []),
    findAllEscrows().catch(() => []),
    findAllAttestations().catch(() => []),
    findAllFeedbacks().catch(() => []),
    findAllVaults().catch(() => []),
  ]);

  // Match as agent PDA or wallet
  const asAgentPda = agents.find((a) => a.pda.toBase58() === address);
  const asAgentWallet = agents.find((a) => {
    const wallet = (a.identity as any)?.wallet;
    return wallet?.toBase58?.() === address || String(wallet) === address;
  });

  // Match as tool PDA
  const asToolPda = tools.find((t) => t.pda.toBase58() === address);

  // Match as escrow PDA
  const asEscrowPda = escrows.find((e) => e.pda.toBase58() === address);

  // Match as attestation PDA
  const asAttestationPda = attestations.find((a) => a.pda.toBase58() === address);

  // Match as feedback PDA
  const asFeedbackPda = feedbacks.find((f) => f.pda.toBase58() === address);

  // Match as vault PDA
  const asVaultPda = vaults.find((v) => v.pda.toBase58() === address);

  // Related entities
  const relatedTools = tools.filter((t) => {
    const agent = (t.descriptor as any)?.agent;
    return agent?.toBase58?.() === address || String(agent) === address;
  });
  const relatedEscrows = escrows.filter((e) => {
    const a = (e.account as any);
    return e.pda.toBase58() === address ||
      a?.agent?.toBase58?.() === address || String(a?.agent) === address ||
      a?.depositor?.toBase58?.() === address || String(a?.depositor) === address;
  });
  const relatedAttestations = attestations.filter((a) => {
    const acc = (a.account as any);
    return acc?.agent?.toBase58?.() === address || String(acc?.agent) === address ||
      acc?.attester?.toBase58?.() === address || String(acc?.attester) === address;
  });
  const relatedFeedbacks = feedbacks.filter((f) => {
    const acc = (f.account as any);
    return acc?.agent?.toBase58?.() === address || String(acc?.agent) === address ||
      acc?.reviewer?.toBase58?.() === address || String(acc?.reviewer) === address;
  });

  // 4) Get recent transactions (via public RPC — Synapse upstream doesn't index signatures)
  let recentTxs: any[] = [];
  try {
    const sigs = await getSynapseConnection().getSignaturesForAddress(pubkey, { limit: 20 });
    recentTxs = sigs.map((s) => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: s.blockTime ?? null,
      err: s.err !== null,
      memo: s.memo ?? null,
    }));
  } catch { /* ignore */ }

  // Determine entity type
  const entityType = asAgentPda ? 'agent' :
    asToolPda ? 'tool' :
    asEscrowPda ? 'escrow' :
    asAttestationPda ? 'attestation' :
    asFeedbackPda ? 'feedback' :
    asVaultPda ? 'vault' :
    asAgentWallet ? 'wallet' :
    accountInfo ? 'account' :
    'unknown';

  return NextResponse.json({
    address,
    entityType,
    balance,
    owner: accountInfo?.owner?.toString?.() ?? null,
    executable: accountInfo?.executable ?? false,
    rentEpoch: accountInfo?.rentEpoch ?? null,
    dataSize: accountInfo?.data ? (
      typeof accountInfo.data === 'string' ? accountInfo.data.length :
      Array.isArray(accountInfo.data) ? accountInfo.data[0]?.length ?? 0 : 0
    ) : 0,

    // SAP entities
    agent: asAgentPda ? serializeDiscoveredAgent(asAgentPda) : asAgentWallet ? serializeDiscoveredAgent(asAgentWallet) : null,
    tool: asToolPda ? serializeDiscoveredTool(asToolPda) : null,
    escrow: asEscrowPda ? serialize(asEscrowPda.account) : null,
    attestation: asAttestationPda ? serialize(asAttestationPda.account) : null,
    feedback: asFeedbackPda ? serialize(asFeedbackPda.account) : null,
    vault: asVaultPda ? serialize(asVaultPda.account) : null,

    // Related
    relatedTools: relatedTools.map(serializeDiscoveredTool),
    relatedEscrows: relatedEscrows.map((e) => ({ pda: e.pda.toBase58(), account: serialize(e.account) })),
    relatedAttestations: relatedAttestations.map((a) => ({ pda: a.pda.toBase58(), account: serialize(a.account) })),
    relatedFeedbacks: relatedFeedbacks.map((f) => ({ pda: f.pda.toBase58(), account: serialize(f.account) })),

    // Recent transactions
    recentTransactions: recentTxs,
  });
  } catch (err: any) {
    console.error('[address]', err);
    return NextResponse.json(
      { error: err.message ?? 'Failed to fetch address data' },
      { status: 500 },
    );
  }
}
