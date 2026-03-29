"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageHeader, Skeleton, EmptyState } from "~/components/ui";

type TxProgram = { id: string; name: string | null };

type SapTx = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: boolean;
  memo: string | null;
  signer: string | null;
  fee: number;
  feeSol: number;
  programs: TxProgram[];
  sapInstructions: string[];
  accountKeys: string[];
  instructionCount: number;
  innerInstructionCount: number;
  computeUnitsConsumed: number | null;
  signerBalanceChange: number;
  version: string;
};

type AgentInfo = { name: string; pda: string; score: number };
type AgentMap = Record<string, AgentInfo>;

type EscrowInfo = { agent: string; depositor: string; agentWallet: string; balance: string };
type EscrowMap = Record<string, EscrowInfo>;

const POLL_MS = 12_000;
const SAP_ADDRESS = 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';

/* ── Helpers ────────────────────────────────── */

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff} secs ago`;
  if (diff < 3_600) return `${Math.floor(diff / 60)} mins ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3_600)} hrs ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

function formatSol(sol: number): string {
  if (sol === 0) return '0';
  if (sol >= 0.001) return sol.toFixed(6);
  return sol.toFixed(9).replace(/0+$/, '');
}

/* ── Known program metadata ─────────────────── */

type ProgramMeta = {
  short: string;
  type: 'sap' | 'solana' | 'defi' | 'other';
  color: string;
};

const PROGRAM_META: Record<string, ProgramMeta> = {
  [SAP_ADDRESS]:
    { short: 'SAP', type: 'sap', color: '' },
  '11111111111111111111111111111111':
    { short: 'Sys', type: 'solana', color: '' },
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA':
    { short: 'Tk', type: 'solana', color: '' },
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb':
    { short: 'T22', type: 'solana', color: '' },
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL':
    { short: 'ATA', type: 'solana', color: '' },
  'ComputeBudget111111111111111111111111111111':
    { short: 'CU', type: 'solana', color: '' },
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr':
    { short: 'Me', type: 'solana', color: '' },
  'Memo1UhkJBfCR7GnRtJ5UcRPEMkY2DGqMGYAS8sEy6P':
    { short: 'Me', type: 'solana', color: '' },
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4':
    { short: 'JUP', type: 'defi', color: '#22c55e' },
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8':
    { short: 'RAY', type: 'defi', color: '#3b82f6' },
  '6EF8rrecthR5Dkzon8Nwu78hRvfKKBP2U5kQKSR5rGrB':
    { short: 'PF', type: 'defi', color: '#f97316' },
};

/** Deterministic color from program ID */
const OTHER_COLORS = ['#22c55e', '#f97316', '#3b82f6', '#a855f7', '#eab308', '#06b6d4'];
function colorFor(pid: string): string {
  let h = 0;
  for (let i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) | 0;
  return OTHER_COLORS[Math.abs(h) % OTHER_COLORS.length];
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProgramBadge({ program }: { program: TxProgram }) {
  const isSAP = program.id === "SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ";
  const label = program.name ?? `${program.id.slice(0, 6)}…`;

function getMeta(p: TxProgram): ProgramMeta {
  const known = PROGRAM_META[p.id];
  if (known) return known;
  return {
    short: getInitials(p.id, p.name),
    type: 'other',
    color: colorFor(p.id),
  };
}

/* ── Program Icon component ─────────────────── */

/** Inline Solana logo SVG — fills parent */
function SolanaLogo({ size }: { size: number }) {
  const s = Math.round(size * 0.8);
  return (
    <svg width={s} height={s} viewBox="0 0 397 312" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" fill="#fff"/>
      <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="#fff"/>
      <path d="M332.1 120c-2.4-2.4-5.7-3.8-9.2-3.8H5.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1L332.1 120z" fill="#fff"/>
    </svg>
  );
}

function ProgramIcon({ program, size = 22 }: { program: TxProgram; size?: number }) {
  const meta = getMeta(program);

  // SAP Program → use the project logo
  if (meta.type === 'sap') {
    return (
      <span
        className="inline-flex items-center justify-center shrink-0 rounded-md bg-primary/10 ring-1 ring-primary/20 overflow-hidden"
        style={{ width: size, height: size }}
        title={program.name ?? 'SAP Program'}
      >
        <Image src="/images/synapse.png" alt="SAP" width={size} height={size} className="object-cover" />
      </span>
    );
  }

  // Solana native programs → Solana logo
  if (meta.type === 'solana') {
    return (
      <span
        className="inline-flex items-center justify-center shrink-0 rounded-md"
        style={{ width: size, height: size, background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)' }}
        title={program.name ?? meta.short}
      >
        <SolanaLogo size={size} />
      </span>
    );
  }

  // Other programs → colored circle with initials
  const bg = meta.color || colorFor(program.id);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-medium ${
        isSAP
          ? "bg-violet-500/15 text-violet-300 border border-violet-500/20"
          : "bg-white/[0.04] text-white/50 border border-white/[0.06]"
      }`}
      title={program.id}
    >
      {meta.short}
    </span>
  );
}

/* ── Action label (replaces badges) ─────────── */

function ActionLabel({ tx }: { tx: SapTx }) {
  const ix = tx.sapInstructions;
  const hasSap = tx.programs.some(p => p.id === SAP_ADDRESS);

  // Show first sap instruction as the primary "action"
  if (ix.length > 0) {
    const first = ix[0];
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-primary">
          {first}
        </span>
        {ix.length > 1 && (
          <span className="text-[10px] text-muted-foreground">+{ix.length - 1}</span>
        )}
      </div>
    );
  }

  // Fallback: derive from programs
  if (hasSap) return <span className="text-xs text-primary">SAP Tx</span>;

  const names = tx.programs.map(p => p.name).filter(Boolean);
  if (names.length > 0) return <span className="text-xs text-muted-foreground">{names[0]}</span>;

  return <span className="text-xs text-muted-foreground">Transfer</span>;
}

/* ── Resolve labeled parties from accountKeys ── */

type Party = {
  address: string;
  label: string;
  type: 'agent-wallet' | 'agent-pda' | 'escrow-depositor' | 'escrow-agent';
  link: string;
};

const KNOWN_PROGRAMS = new Set(Object.keys(PROGRAM_META));

function resolveCounterparties(tx: SapTx, agentMap: AgentMap, escrowMap: EscrowMap): Party[] {
  const parties: Party[] = [];
  const seen = new Set<string>();
  // Track which wallets we've resolved — dedup agent-wallet/agent-pda/escrow
  const resolvedWallets = new Set<string>();

  // Build reverse PDA → wallet map
  const pdaToWallet: Record<string, { wallet: string; name: string }> = {};
  for (const [wallet, info] of Object.entries(agentMap)) {
    if (info.pda) pdaToWallet[info.pda] = { wallet, name: info.name };
  }

  for (const key of (tx.accountKeys ?? [])) {
    if (seen.has(key)) continue;
    seen.add(key);

    // Skip signer, known programs
    if (key === tx.signer) continue;
    if (KNOWN_PROGRAMS.has(key)) continue;

    const agentByWallet = agentMap[key];
    if (agentByWallet && !resolvedWallets.has(key)) {
      resolvedWallets.add(key);
      parties.push({
        address: key,
        label: agentByWallet.name,
        type: 'agent-wallet',
        link: `/agents/${key}`,
      });
      continue;
    }

    const pdaOwner = pdaToWallet[key];
    if (pdaOwner) {
      // Skip if we already resolved this agent by wallet
      if (resolvedWallets.has(pdaOwner.wallet)) continue;
      resolvedWallets.add(pdaOwner.wallet);
      parties.push({
        address: pdaOwner.wallet,
        label: pdaOwner.name,
        type: 'agent-pda',
        link: `/agents/${pdaOwner.wallet}`,
      });
      continue;
    }

    // Check if this is an escrow PDA
    const escrow = escrowMap[key];
    if (escrow) {
      // Resolve counterparty: if signer is the depositor → show agent, else show depositor
      const isSignerDepositor = tx.signer === escrow.depositor;
      const counterAddr = isSignerDepositor ? escrow.agentWallet : escrow.depositor;
      const counterAgent = agentMap[escrow.agentWallet];
      const depositorAgent = agentMap[escrow.depositor];

      // Skip if we already resolved this counterparty
      if (resolvedWallets.has(counterAddr || key)) continue;
      resolvedWallets.add(counterAddr || key);

      if (isSignerDepositor && counterAgent) {
        parties.push({
          address: escrow.agentWallet,
          label: `${counterAgent.name} (Escrow)`,
          type: 'escrow-agent',
          link: `/agents/${escrow.agentWallet}`,
        });
      } else if (!isSignerDepositor && depositorAgent) {
        parties.push({
          address: escrow.depositor,
          label: `${depositorAgent.name} (Depositor)`,
          type: 'escrow-depositor',
          link: `/agents/${escrow.depositor}`,
        });
      } else {
        const resolvedAgent = counterAgent ?? depositorAgent;
        const label = resolvedAgent
          ? `${resolvedAgent.name} (Escrow)`
          : `Escrow`;
        parties.push({
          address: counterAddr || key,
          label,
          type: isSignerDepositor ? 'escrow-agent' : 'escrow-depositor',
          link: counterAddr ? `/address/${counterAddr}` : `/address/${key}`,
        });
      }
      continue;
    }
  }

  return parties;
}

/* ── Compact address + label ── */

function AddrLabel({ address, label, link }: {
  address: string; label?: string | null; link: string;
}) {
  const short = `${address.slice(0, 6)}…${address.slice(-6)}`;
  return (
    <Link
      href={link}
      className="flex flex-col gap-px max-w-[160px] group/addr"
      title={address}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-sm xs:text-xs font-mono text-primary/70 group-hover/addr:text-primary truncate transition-colors">
        {short}
      </span>
      {label && (
        <span className="text-[12px] text-foreground/50 group-hover/addr:text-foreground/70 truncate leading-tight transition-colors">
          {label}
        </span>
      )}
    </Link>
  );
}

/* ── Mobile Card Component ──────────────────── */
function TransactionCard({ tx }: { tx: SapTx }) {
  return (
    <Link
      href={`/tx/${tx.signature}`}
      className="block glass-card-static p-4 hover:bg-white/[0.015] transition-all duration-150"
    >
      {/* Signature */}
      <div className="mb-2">
        <div className="flex items-center justify-between gap-2">
          <span
            className="font-mono text-[11px] text-blue-400/70 truncate flex-1"
            title={tx.signature}
          >
            {tx.signature.slice(0, 16)}…{tx.signature.slice(-4)}
          </span>
          <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
              tx.err
                ? "bg-red-500/10 text-red-400 border border-red-500/15"
                : "bg-emerald-500/8 text-emerald-400 border border-emerald-500/10"
            }`}
          >
            {tx.err ? "Failed" : "OK"}
          </span>
        </div>
        <span className="text-[8px] text-white/25 font-mono">
          Slot {tx.slot.toLocaleString()}
          {tx.version !== "legacy" && ` · v${tx.version}`}
        </span>
      </div>

      {/* Signer */}
      {tx.signer && (
        <div className="mb-2 text-[10px] text-white/40">
          <span className="text-white/25">Signer: </span>
          <span className="font-mono" title={tx.signer}>
            {tx.signer.slice(0, 8)}…{tx.signer.slice(-6)}
          </span>
        </div>
      )}

      {/* Programs & Instructions */}
      <div className="mb-2">
        <div className="flex flex-wrap gap-1">
          {tx.programs.map((p) => (
            <ProgramBadge key={p.id} program={p} />
          ))}
          {tx.sapInstructions.map((name, i) => (
            <InstructionBadge key={`${name}-${i}`} name={name} />
          ))}
        </div>
        <div className="text-[8px] text-white/15 mt-1">
          {tx.instructionCount} instruction
          {tx.instructionCount !== 1 ? "s" : ""}
          {tx.innerInstructionCount > 0 &&
            ` · ${tx.innerInstructionCount} inner`}
        </div>
      </div>

      {/* Meta info grid */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        {tx.blockTime && (
          <>
            <div>
              <span className="text-white/25">Time: </span>
              <span className="text-white/35">{timeAgo(tx.blockTime)}</span>
              <span className="text-white/15 block text-[8px]">
                {formatDate(tx.blockTime)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-white/25">Fee: </span>
              <span className="font-mono text-white/35">
                {tx.feeSol > 0 ? `◎ ${tx.feeSol.toFixed(6)}` : "—"}
              </span>
            </div>
          </>
        )}
        {tx.computeUnitsConsumed != null && (
          <div>
            <span className="text-white/25">CU: </span>
            <span className="font-mono text-white/35">
              {tx.computeUnitsConsumed.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

/* ── Page ───────────────────────────────────── */
export default function TransactionsPage() {
  const [txs, setTxs] = useState<SapTx[]>([]);
  const [agentMap, setAgentMap] = useState<AgentMap>({});
  const [escrowMap, setEscrowMap] = useState<EscrowMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  // Filters
  const [hideSpam, setHideSpam] = useState(false);
  const [hideFailed, setHideFailed] = useState(false);
  const [oldest, setOldest] = useState(false);
  const [perPage, setPerPage] = useState(25);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/sap/transactions")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setTxs(data.transactions ?? []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchEscrowMap = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/sap/escrows/map', { signal });
      if (res.ok) setEscrowMap(await res.json());
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetchTxs(false, ac.signal);
    fetchAgentMap(ac.signal);
    fetchEscrowMap(ac.signal);
    const t1 = setInterval(() => fetchTxs(true, ac.signal), POLL_MS);
    const t2 = setInterval(() => fetchAgentMap(ac.signal), 60_000);
    const t3 = setInterval(() => fetchEscrowMap(ac.signal), 60_000);
    return () => { ac.abort(); clearInterval(t1); clearInterval(t2); clearInterval(t3); };
  }, [fetchTxs, fetchAgentMap, fetchEscrowMap]);

  // Apply filters
  let filtered = [...txs];
  if (hideFailed) filtered = filtered.filter(tx => !tx.err);
  if (hideSpam) {
    filtered = filtered.filter(tx =>
      tx.feeSol > 0.000004 || tx.sapInstructions.length > 0 || Math.abs(tx.signerBalanceChange) > 10000,
    );
  }
  if (oldest) filtered.reverse();
  const total = filtered.length;
  const displayed = filtered.slice(0, perPage);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Transactions"
        subtitle="On-chain SAP program transactions — full instruction traceability"
      >
        <span className="text-[10px] tabular-nums text-white/25">
          {txs.length} transactions
        </span>
      </PageHeader>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>

      {/* ── Table fills remaining space ── */}
      {loading ? (
        <Card className="flex-1 min-h-0">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="px-4 py-3">
                  <Skeleton className="h-8 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="flex-1 min-h-0">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : displayed.length === 0 ? (
        <EmptyState message="No SAP transactions found" />
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block glass-card-static overflow-x-auto">
            <div className="grid grid-cols-[1fr_140px_1fr_110px_80px_70px_60px] gap-3 border-b border-white/[0.06] px-5 py-2.5">
              <span className="section-title">Signature</span>
              <span className="section-title">Signer</span>
              <span className="section-title">Programs & Instructions</span>
              <span className="section-title">Time</span>
              <span className="section-title text-right">Fee</span>
              <span className="section-title text-right">CU</span>
              <span className="section-title text-right">Status</span>
            </div>

            <div className="divide-y divide-white/[0.03]">
              {txs.map((tx) => (
                <Link
                  key={tx.signature}
                  href={`/tx/${tx.signature}`}
                  className="grid grid-cols-[1fr_140px_1fr_110px_80px_70px_60px] gap-3 px-5 py-3 hover:bg-white/[0.015] transition-all duration-150 items-start group"
                >
                  {/* Signature */}
                  <div className="min-w-0">
                    <span
                      className="font-mono text-[11px] text-blue-400/70 group-hover:text-blue-400 transition-colors truncate block"
                      title={tx.signature}
                    >
                      {tx.signature.slice(0, 20)}…{tx.signature.slice(-6)}
                    </span>
                    <span className="text-[9px] text-white/15 font-mono">
                      Slot {tx.slot.toLocaleString()}
                      {tx.version !== "legacy" && ` · v${tx.version}`}
                    </span>
                  </div>

                  {/* Signer */}
                  <div className="min-w-0">
                    {tx.signer ? (
                      <span
                        className="font-mono text-[10px] text-white/40 truncate block"
                        title={tx.signer}
                      >
                        {tx.signer.slice(0, 6)}…{tx.signer.slice(-4)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-white/15">—</span>
                    )}
                  </div>

                  {/* Programs & Instructions */}
                  <div className="flex flex-wrap gap-1 min-w-0">
                    {tx.programs.map((p) => (
                      <ProgramBadge key={p.id} program={p} />
                    ))}
                    {tx.sapInstructions.map((name, i) => (
                      <InstructionBadge key={`${name}-${i}`} name={name} />
                    ))}
                    {tx.programs.length === 0 &&
                      tx.sapInstructions.length === 0 && (
                        <span className="text-[10px] text-white/15">—</span>
                      )}
                    <span className="text-[8px] text-white/15 self-center ml-1">
                      {tx.instructionCount} ix
                      {tx.innerInstructionCount > 0 &&
                        ` · ${tx.innerInstructionCount} inner`}
                    </span>
                  </div>

                  {/* Time */}
                  <div>
                    {tx.blockTime ? (
                      <div>
                        <span className="text-[11px] text-white/35 block">
                          {timeAgo(tx.blockTime)}
                        </span>
                        <span className="text-[9px] text-white/15">
                          {formatDate(tx.blockTime)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-white/15">—</span>
                    )}
                  </div>

                  {/* Fee */}
                  <div className="text-right">
                    <span className="font-mono text-[10px] tabular-nums text-white/35">
                      {tx.feeSol > 0 ? `◎ ${tx.feeSol.toFixed(6)}` : "—"}
                    </span>
                  </div>

                  {/* Compute Units */}
                  <div className="text-right">
                    <span className="font-mono text-[9px] tabular-nums text-white/25">
                      {tx.computeUnitsConsumed != null
                        ? tx.computeUnitsConsumed.toLocaleString()
                        : "—"}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                        tx.err
                          ? "bg-red-500/10 text-red-400 border border-red-500/15"
                          : "bg-emerald-500/8 text-emerald-400 border border-emerald-500/10"
                      }`}
                    >
                      {tx.err ? "Failed" : "OK"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden space-y-3">
            {txs.map((tx) => (
              <TransactionCard key={tx.signature} tx={tx} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
