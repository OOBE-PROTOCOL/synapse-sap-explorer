export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────────────────────
 * GET /api/sap/vaults/[pda] — Full Memory-Layer Vault Detail
 *
 * Returns vault + all 4 memory layers:
 *   Memory Vault  — encrypted TX-log inscriptions (via epochs)
 *   Memory Ledger — ring buffer + sealed pages
 *   Delegates     — vault delegation
 *   Checkpoints   — merkle integrity snapshots
 *
 * Data source priority: DB (sap_* tables) → on-chain fallback
 * ────────────────────────────────────────────────────────────── */

import { NextRequest } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { swr } from '~/lib/cache';
import {
  getVaultByPda,
  getSessionsByVault,
  getEpochPagesBySession,
  getLedgerBySession,
  getLedgerPagesByLedger,
  getDelegatesByVault,
  getCheckpointsBySession,
  getEventsByVault,
} from '~/db/memory-queries';
import type { SapLedgerPage } from '~/db/memory-queries';

/* ── Response Types ── */

export type RingEntry = {
  index: number;
  size: number;
  data: string;   // base64
  text: string | null; // utf-8 attempt
};

export type SerializedLedgerPage = {
  pda: string;
  pageIndex: number;
  sealedAt: number;
  entriesInPage: number;
  dataSize: number;
  merkleRootAtSeal: string;
  entries: RingEntry[];
};

export type SerializedLedger = {
  pda: string;
  authority: string;
  numEntries: number;
  numPages: number;
  totalDataSize: number;
  merkleRoot: string;
  latestHash: string;
  createdAt: number;
  updatedAt: number;
  ringEntries: RingEntry[];
  pages: SerializedLedgerPage[];
};

export type SerializedEpochPage = {
  pda: string;
  epochIndex: number;
  startSequence: number;
  inscriptionCount: number;
  totalBytes: number;
  firstTs: number;
  lastTs: number;
};

export type SerializedCheckpoint = {
  pda: string;
  checkpointIndex: number;
  merkleRoot: string;
  sequenceAt: number;
  epochAt: number;
  totalBytesAt: number;
  inscriptionsAt: number;
  createdAt: number;
};

export type SerializedDelegate = {
  pda: string;
  delegate: string;
  permissions: number;
  permissionLabels: string[];
  expiresAt: number;
  createdAt: number;
};

export type SerializedEvent = {
  id: number;
  name: string;
  txSignature: string;
  slot: number;
  blockTime: number | null;
  data: Record<string, unknown>;
};

export type SerializedSession = {
  pda: string;
  vault: string;
  sessionHash: string;
  sequenceCounter: number;
  totalBytes: number;
  currentEpoch: number;
  totalEpochs: number;
  createdAt: number;
  lastInscribedAt: number | null;
  isClosed: boolean;
  merkleRoot: string;
  totalCheckpoints: number;
  tipHash: string;
  ledger: SerializedLedger | null;
  epochPages: SerializedEpochPage[];
  checkpoints: SerializedCheckpoint[];
};

export type VaultDetailResponse = {
  pda: string;
  agent: string;
  wallet: string;
  vaultNonce: string;
  totalSessions: number;
  totalInscriptions: number;
  totalBytesInscribed: number;
  createdAt: number;
  nonceVersion: number;
  lastNonceRotation: number | null;
  protocolVersion: number;
  sessions: SerializedSession[];
  delegates: SerializedDelegate[];
  events: SerializedEvent[];
  memorySummary: {
    hasVaultInscriptions: boolean;
    hasLedger: boolean;
    hasEpochPages: boolean;
    hasDelegates: boolean;
    hasCheckpoints: boolean;
    totalLedgerEntries: number;
    totalSealedPages: number;
    totalEpochPages: number;
    totalDelegates: number;
    totalCheckpoints: number;
  };
};

/* ── Permission bitmask decoder ── */

const PERM_LABELS: [number, string][] = [
  [1, 'inscribe'],
  [2, 'close_session'],
  [4, 'open_session'],
];

function decodePermissions(mask: number): string[] {
  return PERM_LABELS.filter(([bit]) => mask & bit).map(([, l]) => l);
}

/* ── Ring buffer decoder: [u16 LE length][data] repeating ── */

function decodeRingBuffer(ringBase64: string | null): RingEntry[] {
  if (!ringBase64) return [];
  const buf = Buffer.from(ringBase64, 'base64');
  const entries: RingEntry[] = [];
  let offset = 0;
  let idx = 0;
  while (offset + 2 <= buf.length) {
    const len = buf.readUInt16LE(offset);
    if (len === 0) break;
    offset += 2;
    if (offset + len > buf.length) break;
    const data = buf.slice(offset, offset + len);
    offset += len;
    let text: string | null = null;
    try {
      const s = data.toString('utf8');
      if (/^[\x20-\x7E\n\r\t]+$/.test(s)) text = s;
    } catch { /* binary */ }
    entries.push({ index: idx++, size: len, data: data.toString('base64'), text });
  }
  return entries;
}

/* ── Main fetch logic ── */

async function fetchVaultDetail(pdaStr: string): Promise<VaultDetailResponse> {
  // 1. Vault from DB
  const vault = await getVaultByPda(pdaStr);
  if (!vault) {
    throw new Error('Vault not found');
  }

  // 2. Parallel: sessions, delegates, events
  const [dbSessions, delegates, events] = await Promise.all([
    getSessionsByVault(pdaStr),
    getDelegatesByVault(pdaStr),
    getEventsByVault(pdaStr, { limit: 100 }),
  ]);

  // 3. For each session, fetch ledger + epoch pages + checkpoints in parallel
  const sessions: SerializedSession[] = await Promise.all(
    dbSessions.map(async (sess) => {
      const [ledger, epochPages, checkpoints] = await Promise.all([
        getLedgerBySession(sess.pda),
        getEpochPagesBySession(sess.pda),
        getCheckpointsBySession(sess.pda),
      ]);

      // If ledger exists, also fetch sealed pages
      let ledgerPages: SapLedgerPage[] = [];
      if (ledger) {
        ledgerPages = await getLedgerPagesByLedger(ledger.pda);
      }

      const serializedLedger: SerializedLedger | null = ledger
        ? {
            pda: ledger.pda,
            authority: ledger.authority,
            numEntries: ledger.numEntries,
            numPages: ledger.numPages,
            totalDataSize: ledger.totalDataSize,
            merkleRoot: ledger.merkleRoot,
            latestHash: ledger.latestHash,
            createdAt: ledger.createdAt,
            updatedAt: ledger.updatedAt,
            ringEntries: decodeRingBuffer(ledger.ring),
            pages: ledgerPages.map((p) => ({
              pda: p.pda,
              pageIndex: p.pageIndex,
              sealedAt: p.sealedAt,
              entriesInPage: p.entriesInPage,
              dataSize: p.dataSize,
              merkleRootAtSeal: p.merkleRootAtSeal,
              entries: decodeRingBuffer(p.data),
            })),
          }
        : null;

      return {
        pda: sess.pda,
        vault: sess.vault,
        sessionHash: sess.sessionHash,
        sequenceCounter: sess.sequenceCounter,
        totalBytes: sess.totalBytes,
        currentEpoch: sess.currentEpoch,
        totalEpochs: sess.totalEpochs,
        createdAt: sess.createdAt,
        lastInscribedAt: sess.lastInscribedAt,
        isClosed: sess.isClosed,
        merkleRoot: sess.merkleRoot,
        totalCheckpoints: sess.totalCheckpoints,
        tipHash: sess.tipHash,
        ledger: serializedLedger,
        epochPages: epochPages.map((ep) => ({
          pda: ep.pda,
          epochIndex: ep.epochIndex,
          startSequence: ep.startSequence,
          inscriptionCount: ep.inscriptionCount,
          totalBytes: ep.totalBytes,
          firstTs: ep.firstTs,
          lastTs: ep.lastTs,
        })),
        checkpoints: checkpoints.map((cp) => ({
          pda: cp.pda,
          checkpointIndex: cp.checkpointIndex,
          merkleRoot: cp.merkleRoot,
          sequenceAt: cp.sequenceAt,
          epochAt: cp.epochAt,
          totalBytesAt: cp.totalBytesAt,
          inscriptionsAt: cp.inscriptionsAt,
          createdAt: cp.createdAt,
        })),
      };
    }),
  );

  // 4. Compute memory summary
  const totalLedgerEntries = sessions.reduce((s, sess) => s + (sess.ledger?.numEntries ?? 0), 0);
  const totalSealedPages = sessions.reduce((s, sess) => s + (sess.ledger?.numPages ?? 0), 0);
  const totalEpochPages = sessions.reduce((s, sess) => s + sess.epochPages.length, 0);
  const totalCheckpoints = sessions.reduce((s, sess) => s + sess.checkpoints.length, 0);

  return {
    pda: vault.pda,
    agent: vault.agent,
    wallet: vault.wallet,
    vaultNonce: vault.vaultNonce,
    totalSessions: vault.totalSessions,
    totalInscriptions: vault.totalInscriptions,
    totalBytesInscribed: vault.totalBytesInscribed,
    createdAt: vault.createdAt,
    nonceVersion: vault.nonceVersion,
    lastNonceRotation: vault.lastNonceRotation,
    protocolVersion: vault.protocolVersion,
    sessions,
    delegates: delegates.map((d) => ({
      pda: d.pda,
      delegate: d.delegate,
      permissions: d.permissions,
      permissionLabels: decodePermissions(d.permissions),
      expiresAt: d.expiresAt,
      createdAt: d.createdAt,
    })),
    events: events.map((e) => ({
      id: e.id,
      name: e.eventName,
      txSignature: e.txSignature,
      slot: e.slot,
      blockTime: e.blockTime,
      data: e.data,
    })),
    memorySummary: {
      hasVaultInscriptions: vault.totalInscriptions > 0,
      hasLedger: totalLedgerEntries > 0,
      hasEpochPages: totalEpochPages > 0,
      hasDelegates: delegates.length > 0,
      hasCheckpoints: totalCheckpoints > 0,
      totalLedgerEntries,
      totalSealedPages,
      totalEpochPages,
      totalDelegates: delegates.length,
      totalCheckpoints,
    },
  };
}

export const GET = withSynapseError(async (req: NextRequest) => {
  const pda = req.nextUrl.pathname.split('/').pop();
  if (!pda) {
    return new Response(JSON.stringify({ error: 'Missing vault PDA' }), { status: 400 });
  }

  // Validate PDA
  try { new PublicKey(pda); } catch {
    return new Response(JSON.stringify({ error: 'Invalid PDA' }), { status: 400 });
  }

  const cacheKey = `vault-detail:${pda}`;
  const data = await swr(cacheKey, () => fetchVaultDetail(pda), {
    ttl: 30_000,
    swr: 120_000,
  });

  return synapseResponse(data);
});
