/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ExplorerPageShell, ExplorerMetric, EmptyState } from '~/components/ui';
import { ArrowRightLeft, CheckCircle2, Calendar, Search, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Skeleton } from '~/components/ui/skeleton';
import { Card, CardContent } from '~/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { timeAgo } from '~/lib/format';

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
  sapEvents?: string[];
  accountKeys: string[];
  instructionCount: number;
  innerInstructionCount: number;
  computeUnitsConsumed: number | null;
  signerBalanceChange: number;
  version: string;
  value: { amount: number; symbol: string } | null;
};

type AgentInfo = { name: string; pda: string; score: number };
type AgentMap = Record<string, AgentInfo>;

type EscrowInfo = { agent: string; depositor: string; agentWallet: string; balance: string };
type EscrowMap = Record<string, EscrowInfo>;

const POLL_MS = 12_000;
const SAP_ADDRESS = 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';
const PREFETCH_PER_PAGE = 5000;

/* ── Helpers ────────────────────────────────── */

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

function getInitials(pid: string, name: string | null): string {
  if (name) {
    const words = name.split(/[\s-]+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return pid.slice(0, 2).toUpperCase();
}

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
      className="inline-flex items-center justify-center shrink-0 rounded-md text-white font-semibold"
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.42, lineHeight: 1 }}
      title={program.name ?? program.id}
    >
      {meta.short}
    </span>
  );
}

/* ── Action label (replaces badges) ─────────── */

/** Strip `Event` suffix for compact display: PaymentSettledEvent → PaymentSettled */
function shortEventName(name: string) {
  return name.endsWith('Event') ? name.slice(0, -5) : name;
}

/** Convert snake_case to Title Case for display: settle_calls → Settle Calls */
const IX_DISPLAY_NAMES: Record<string, string> = {
  x402DirectPayment: 'x402 Payment',
  splTransfer: 'SPL Transfer',
};

function ixDisplayName(name: string) {
  if (IX_DISPLAY_NAMES[name]) return IX_DISPLAY_NAMES[name];
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ActionLabel({ tx }: { tx: SapTx }) {
  const events = tx.sapEvents ?? [];
  const ix = tx.sapInstructions;
  const hasSap = tx.programs.some(p => p.id === SAP_ADDRESS);
  const isTransfer = ix.length > 0 && ix[0] === 'splTransfer';

  // Prefer instruction names (like Solscan shows function calls)
  if (ix.length > 0) {
    const first = ixDisplayName(ix[0]);
    return (
      <div className="flex items-center gap-1.5">
        <span className={cn(
          'text-sm font-medium',
          isTransfer ? 'text-muted-foreground' : 'text-primary',
        )}>{first}</span>
        {ix.length > 1 && (
          <span className="text-[10px] text-muted-foreground">+{ix.length - 1}</span>
        )}
      </div>
    );
  }

  // Fall back to event names
  if (events.length > 0) {
    const first = shortEventName(events[0]);
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-primary/80">{first}</span>
        {events.length > 1 && (
          <span className="text-[10px] text-muted-foreground">+{events.length - 1}</span>
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

/* ── Transaction row ────────────────────────── */

function TxRow({ tx, agentMap, escrowMap }: { tx: SapTx; agentMap: AgentMap; escrowMap: EscrowMap }) {
  const router = useRouter();
  const signerAgent = tx.signer ? agentMap[tx.signer] : null;
  const counterparties = resolveCounterparties(tx, agentMap, escrowMap);


  return (
    <TableRow
      className="cursor-pointer group transition-colors hover:bg-accent/40"
      onClick={() => router.push(`/tx/${tx.signature}`)}
    >
      {/* Status dot */}
      <TableCell className="w-8 pr-0">
        {tx.err ? (
          <span className="block h-2 w-2 rounded-full bg-red-500" title="Failed" />
        ) : (
          <span className="block h-2 w-2 rounded-full bg-emerald-500" title="Success" />
        )}
      </TableCell>

      {/* Signature */}
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-primary group-hover:underline" title={tx.signature}>
        {tx.signature.slice(0, 16)}…
          </span>
          <button
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(tx.signature);
        }}
        className="shrink-0 p-1 hover:bg-muted rounded transition-colors"
        title="Copy signature"
          >
        <svg className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" />
        </svg>
          </button>
          <a
        href={`https://solscan.io/tx/${tx.signature}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 p-1 hover:bg-muted rounded transition-colors"
        title="Open on Solscan"
          >
        <svg className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
          </a>
        </div>
      </TableCell>

      {/* Block */}
      <TableCell>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {tx.slot}
        </span>
      </TableCell>

      {/* Time */}
      <TableCell>
        {tx.blockTime ? (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {timeAgo(tx.blockTime)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </TableCell>

      {/* Action */}
      <TableCell>
        <ActionLabel tx={tx} />
      </TableCell>

      {/* Signer */}
      <TableCell className="hidden md:table-cell">
        {tx.signer ? (
          <AddrLabel
            address={tx.signer}
            label={signerAgent?.name}
            link={signerAgent ? `/agents/${tx.signer}` : `/address/${tx.signer}`}
          />
        ) : (
          <span className="text-sm xs:text-xs text-muted-foreground/10">—</span>
        )}
      </TableCell>

      {/* Interacted With (only labeled counterparties) */}
      <TableCell className="hidden lg:table-cell">
        {counterparties.length === 1 ? (
          /* Single counterparty → normal vertical layout */
          <AddrLabel address={counterparties[0].address} label={counterparties[0].label} link={counterparties[0].link} />
        ) : counterparties.length > 1 ? (
          /* Multiple → compact horizontal: pubkey left, name right */
          <div className="flex flex-col gap-1">
            {counterparties.slice(0, 2).map((p) => (
              <Link
                key={p.address}
                href={p.link}
                className="flex items-center gap-2 max-w-[90%] group/addr"
                title={p.address}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-[12px] font-mono text-primary/70 group-hover/addr:text-primary shrink-0 transition-colors">
                  {p.address.slice(0, 6)}…{p.address.slice(-6)}
                </span>
                {p.label && (
                  <span className="text-[12px] text-foreground/50 group-hover/addr:text-foreground/70 truncate transition-colors">
                    {p.label}
                  </span>
                )}
              </Link>
            ))}
            {counterparties.length > 2 && (
              <span className="text-[9px] text-muted-foreground/40">
                +{counterparties.length - 2} more
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm xs:text-xs text-muted-foreground/10">—</span>
        )}
      </TableCell>

      {/* Value */}
      <TableCell className="text-right">
        {tx.value ? (
          <div className="flex items-center justify-end gap-1">
            <span className="font-mono text-xs tabular-nums text-foreground">
              {tx.value.amount < 0.01
                ? tx.value.amount.toFixed(6)
                : tx.value.amount < 1000
                  ? tx.value.amount.toFixed(2)
                  : tx.value.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
            <span className={`text-[10px] font-medium ${
              tx.value.symbol === 'USDC' ? 'text-emerald-400' :
              tx.value.symbol === 'SOL' ? 'text-primary' :
              'text-muted-foreground'
            }`}>
              {tx.value.symbol}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/30">—</span>
        )}
      </TableCell>

      {/* Fees (SOL) */}
      <TableCell className="text-right">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatSol(tx.feeSol)}
        </span>
      </TableCell>

      {/* Programs (as icons) */}
      <TableCell>
        <div className="flex items-center gap-1">
          {tx.programs.map((p) => (
            <ProgramIcon key={p.id} program={p} size={20} />
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ── Main page ──────────────────────────────── */

export default function TransactionsPage() {
  const [txs, setTxs] = useState<SapTx[]>([]);
  const txsRef = useRef(txs);
  txsRef.current = txs;
  const [agentMap, setAgentMap] = useState<AgentMap>({});
  const [escrowMap, setEscrowMap] = useState<EscrowMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [serverTotal, setServerTotal] = useState(0);

  // Filters (no pagination — all txs loaded at once)
  const [search, setSearch] = useState('');
  const [hideSpam, setHideSpam] = useState(false);
  const [hideFailed, setHideFailed] = useState(false);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [sapFilter, setSapFilter] = useState('all');
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  const fetchTxs = useCallback(async (poll: boolean, signal?: AbortSignal) => {
    if (poll) setRefreshing(true);
    try {
      // Prefetch all txs from DB on initial load; poll only deltas after latest slot.
      const params = new URLSearchParams({ page: '1', perPage: String(PREFETCH_PER_PAGE) });
      if (poll) {
        const cur = txsRef.current;
        if (cur.length > 0) params.set('after', String(Math.max(...cur.map(t => t.slot))));
      }
      const res = await fetch(`/api/sap/transactions?${params}`, { signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const incoming: SapTx[] = data.transactions ?? [];
      
      if (!poll) {
        setServerTotal(data.total ?? incoming.length);
      }

      if (poll) {
        // Poll merge across the prefetched list
        if (incoming.length > 0) {
          setTxs(prev => {
            const sigSet = new Set(prev.map(t => t.signature));
            const fresh = incoming.filter(t => !sigSet.has(t.signature));
            if (fresh.length === 0) return prev;
            return [...fresh, ...prev].sort((a, b) => b.slot - a.slot);
          });
        }
      } else {
        // Initial load
        setTxs(incoming);
      }
      setLastUpdated(Date.now());
      setError(null);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!poll) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (poll) setRefreshing(false); else setLoading(false);
    }
  }, []);

  const fetchAgentMap = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/sap/agents/map', { signal });
      if (res.ok) setAgentMap(await res.json());
    } catch (e) { if (!(e instanceof DOMException && (e as DOMException).name === 'AbortError')) console.warn('[txs] agent map fetch failed:', (e as Error).message); }
  }, []);

  const fetchEscrowMap = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/sap/escrows/map', { signal });
      if (res.ok) setEscrowMap(await res.json());
    } catch (e) { if (!(e instanceof DOMException && (e as DOMException).name === 'AbortError')) console.warn('[txs] escrow map fetch failed:', (e as Error).message); }
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

  // Unique SAP instruction names from all loaded txs (for filter dropdown)
  const sapInstructionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const tx of txs) {
      for (const ix of tx.sapInstructions) set.add(ix);
    }
    return [...set].sort();
  }, [txs]);

  // Apply filters
  let filtered = [...txs];
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(tx =>
      tx.signature.toLowerCase().includes(q) ||
      tx.signer?.toLowerCase().includes(q) ||
      tx.sapInstructions.some(i => i.toLowerCase().includes(q)) ||
      tx.programs.some(p => p.name?.toLowerCase().includes(q)),
    );
  }
  if (sapFilter !== 'all') {
    filtered = filtered.filter(tx => tx.sapInstructions.includes(sapFilter));
  }
  if (hideFailed) filtered = filtered.filter(tx => !tx.err);
  if (hideSpam) {
    filtered = filtered.filter(tx =>
      tx.feeSol > 0.000004 || tx.sapInstructions.length > 0 || Math.abs(tx.signerBalanceChange) > 10000,
    );
  }
  if (sortDir === 'asc') filtered.reverse();

  const total = serverTotal || txs.length;
  const filteredTotal = filtered.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / perPage));
  const safePage = Math.min(page, totalPages);
  const start = filteredTotal === 0 ? 0 : (safePage - 1) * perPage + 1;
  const end = Math.min(safePage * perPage, filteredTotal);
  const displayed = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const pageWindow = useMemo(() => {
    const pages: number[] = [];
    const from = Math.max(1, safePage - 2);
    const to = Math.min(totalPages, safePage + 2);
    for (let p = from; p <= to; p++) pages.push(p);
    return pages;
  }, [safePage, totalPages]);

  // Stats
  const stats = useMemo(() => {
    const success = txs.filter(t => !t.err).length;
    const signers = new Set(txs.map(t => t.signer).filter(Boolean));
    const times = txs.map(t => t.blockTime).filter(Boolean) as number[];
    const oldest = times.length ? new Date(Math.min(...times) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
    const newest = times.length ? new Date(Math.max(...times) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
    return { success, successRate: txs.length ? Math.round(success / txs.length * 100) : 0, signers: signers.size, oldest, newest };
  }, [txs]);

  const pageRange = useMemo(() => {
    const pageTimes = displayed.map((t) => t.blockTime).filter(Boolean) as number[];
    if (pageTimes.length === 0) return { oldest: '—', newest: '—' };
    return {
      oldest: new Date(Math.min(...pageTimes) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      newest: new Date(Math.max(...pageTimes) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    };
  }, [displayed]);

  useEffect(() => {
    setPage(1);
  }, [search, hideSpam, hideFailed, sortDir, sapFilter]);

  return (
    <ExplorerPageShell
      title="Transactions"
      subtitle={`${total.toLocaleString()} on-chain SAP program transactions`}
      icon={<ArrowRightLeft className="h-5 w-5" />}
      actions={
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 transition-colors" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by signature, signer…"
            className="h-9 pl-9 pr-8 text-sm"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      }
      stats={
        <>
          <ExplorerMetric label="Total Loaded" value={total.toLocaleString()} icon={<ArrowRightLeft className="h-4 w-4" />} sub={`${stats.oldest} – ${stats.newest}`} accent="primary" />
          <ExplorerMetric label="Success Rate" value={`${stats.successRate}%`} icon={<CheckCircle2 className="h-4 w-4" />} sub={`${stats.success} / ${txs.length}`} accent="emerald" />
          <ExplorerMetric label="Page Range" value={`${pageRange.oldest} – ${pageRange.newest}`} icon={<Calendar className="h-4 w-4" />} sub={`page ${safePage} · ${start}-${end}`} accent="amber" />
          {/* Filters card — border only, no bg, 2-column grid */}
          <Card className="border-neutral-700 bg-transparent hover:border-neutral-600 transition-all duration-300">
            <CardContent className="p-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-neutral-400 mb-3">Filters</p>
              <div className="grid grid-cols-2 gap-2">
                {/* Col 1: sort + SAP instruction filter */}
                <div className="flex flex-col gap-2">
                  <Select value={sortDir} onValueChange={(v) => { setSortDir(v as 'asc' | 'desc'); setPage(1); }}>
                    <SelectTrigger className="h-7 w-full text-xs bg-transparent"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Newest first</SelectItem>
                      <SelectItem value="asc">Oldest first</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sapFilter} onValueChange={(v) => { setSapFilter(v); setPage(1); }}>
                    <SelectTrigger className="h-7 w-full text-xs bg-transparent">
                      <SelectValue placeholder="All events" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All events</SelectItem>
                      {sapInstructionOptions.map((ix) => (
                        <SelectItem key={ix} value={ix}>{ixDisplayName(ix)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Col 2: toggles */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { setHideSpam(!hideSpam); setPage(1); }}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2 h-7 w-full text-xs rounded-md border transition-colors',
                      hideSpam ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-transparent border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', hideSpam ? 'bg-primary' : 'bg-neutral-600')} />
                    Hide Spam
                  </button>
                  <button
                    onClick={() => { setHideFailed(!hideFailed); setPage(1); }}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2 h-7 w-full text-xs rounded-md border transition-colors',
                      hideFailed ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-transparent border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', hideFailed ? 'bg-primary' : 'bg-neutral-600')} />
                    Hide Failed
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      }
    >
    <div className="flex flex-col flex-1 min-h-0 animate-fade-in">

      {/* ── Table fills remaining space, Solscan-like native layout ── */}
      {loading ? (
        <div className="flex-1 min-h-0 rounded-lg border border-border/40 bg-background/30 overflow-hidden">
          <div className="divide-y divide-border/50">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="flex-1 min-h-0 rounded-lg border border-border/40 bg-background/30 py-12 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : displayed.length === 0 ? (
        <EmptyState message="No SAP transactions found" />
      ) : (
        <section className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-lg border border-border/40 bg-background/20 backdrop-blur-[2px]">
          {/* Solscan-style pagination/summary bar */}
          <div className="shrink-0 h-10 px-3 border-b border-border/50 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Show</span>
              <select
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setPage(1);
                }}
                className="h-7 rounded border border-border/60 bg-background/80 px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>{start} - {end} of {total.toLocaleString()}</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={safePage === 1}
                className="h-7 min-w-7 px-2 rounded border border-transparent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              >
                «
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="h-7 min-w-7 px-2 rounded border border-transparent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹
              </button>

              {pageWindow.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={cn(
                    'h-7 min-w-7 px-2 rounded text-xs border transition-colors',
                    p === safePage
                      ? 'bg-primary text-primary-foreground border-primary/70'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/60',
                  )}
                >
                  {p}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="h-7 min-w-7 px-2 rounded border border-transparent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ›
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={safePage === totalPages}
                className="h-7 min-w-7 px-2 rounded border border-transparent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              >
                »
              </button>
            </div>
          </div>

          {/* Scrollable table — fills all remaining space */}
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead className="text-xs font-medium">Signature</TableHead>
                  <TableHead className="text-xs font-medium">Block</TableHead>
                  <TableHead className="text-xs font-medium">Time</TableHead>
                  <TableHead className="text-xs font-medium">Action</TableHead>
                  <TableHead className="text-xs font-medium hidden md:table-cell">Signer</TableHead>
                  <TableHead className="text-xs font-medium hidden lg:table-cell">Interacted With</TableHead>
                  <TableHead className="text-xs font-medium text-right">Value</TableHead>
                  <TableHead className="text-xs font-medium text-center">Fees</TableHead>
                  <TableHead className="text-xs font-medium">Programs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayed.map((tx) => (
                  <TxRow key={tx.signature} tx={tx} agentMap={agentMap} escrowMap={escrowMap} />
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
    </ExplorerPageShell>
  );
}
