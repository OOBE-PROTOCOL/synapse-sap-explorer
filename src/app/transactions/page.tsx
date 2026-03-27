'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { PageHeader, EmptyState } from '~/components/ui';
import { Skeleton } from '~/components/ui/skeleton';
import { Card, CardContent } from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';

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

  // Build reverse PDA → wallet map
  const pdaToWallet: Record<string, { wallet: string; name: string }> = {};
  for (const [wallet, info] of Object.entries(agentMap)) {
    if (info.pda) pdaToWallet[info.pda] = { wallet, name: info.name };
  }

  for (const key of tx.accountKeys) {
    if (seen.has(key)) continue;
    seen.add(key);

    // Skip signer, known programs
    if (key === tx.signer) continue;
    if (KNOWN_PROGRAMS.has(key)) continue;

    const agentByWallet = agentMap[key];
    if (agentByWallet) {
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
      parties.push({
        address: key,
        label: `${pdaOwner.name} (PDA)`,
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

      if (isSignerDepositor && counterAgent) {
        // Signer is depositor, show the agent
        parties.push({
          address: escrow.agentWallet,
          label: `${counterAgent.name} (Escrow)`,
          type: 'escrow-agent',
          link: `/agents/${escrow.agentWallet}`,
        });
      } else if (!isSignerDepositor && depositorAgent) {
        // Signer is agent, show the depositor
        parties.push({
          address: escrow.depositor,
          label: `${depositorAgent.name} (Depositor)`,
          type: 'escrow-depositor',
          link: `/agents/${escrow.depositor}`,
        });
      } else {
        // Fallback: show the counterparty address with escrow label
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

/* ── Filters bar ────────────────────────────── */

function FiltersBar({
  hideSpam, setHideSpam, hideFailed, setHideFailed, oldest, setOldest,
}: {
  hideSpam: boolean; setHideSpam: (v: boolean) => void;
  hideFailed: boolean; setHideFailed: (v: boolean) => void;
  oldest: boolean; setOldest: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <ToggleFilter label="Hide Spam Txs" active={hideSpam} onClick={() => setHideSpam(!hideSpam)} />
      <ToggleFilter label="Hide Failed" active={hideFailed} onClick={() => setHideFailed(!hideFailed)} />
      <ToggleFilter label="Oldest First" active={oldest} onClick={() => setOldest(!oldest)} />
    </div>
  );
}

function ToggleFilter({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${
        active
          ? 'bg-primary/10 border-primary/30 text-primary'
          : 'bg-card border-border text-muted-foreground hover:border-primary/20 hover:text-foreground'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full transition-colors ${active ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
      {label}
    </button>
  );
}

/* ── Main page ──────────────────────────────── */

export default function TransactionsPage() {
  const [txs, setTxs] = useState<SapTx[]>([]);
  const [agentMap, setAgentMap] = useState<AgentMap>({});
  const [escrowMap, setEscrowMap] = useState<EscrowMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Filters
  const [hideSpam, setHideSpam] = useState(false);
  const [hideFailed, setHideFailed] = useState(false);
  const [oldest, setOldest] = useState(false);
  const [perPage, setPerPage] = useState(25);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  const fetchTxs = useCallback(async (poll: boolean, signal?: AbortSignal) => {
    if (poll) setRefreshing(true);
    try {
      const res = await fetch('/api/sap/transactions', { signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTxs(data.transactions ?? []);
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
    } catch { /* non-critical */ }
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
    <div className="flex flex-col h-[calc(100vh-2rem)] lg:h-[calc(100vh-3rem)] animate-fade-in">
      {/* ── Pinned header ── */}
      <div className="shrink-0 space-y-4 pb-4">
        <PageHeader
          title="Transactions"
          subtitle="On-chain SAP program transactions"
        >
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full transition-colors ${
              refreshing ? 'bg-primary animate-pulse' : 'bg-emerald-500'
            }`} />
            <span className="text-xs text-muted-foreground">{refreshing ? 'Syncing…' : 'Live'}</span>
          </div>
        </PageHeader>

        {/* Filters */}
        <div className="flex items-center justify-between gap-4">
          <FiltersBar
            hideSpam={hideSpam} setHideSpam={setHideSpam}
            hideFailed={hideFailed} setHideFailed={setHideFailed}
            oldest={oldest} setOldest={setOldest}
          />
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
        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Single scrollable table with sticky header */}
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead className="text-xs font-medium">Signature</TableHead>
                  <TableHead className="text-xs font-medium">Block</TableHead>
                  <TableHead className="text-xs font-medium">Time</TableHead>
                  <TableHead className="text-xs font-medium">Action</TableHead>
                  <TableHead className="text-xs font-medium hidden md:table-cell">Signer</TableHead>
                  <TableHead className="text-xs font-medium hidden lg:table-cell">Interacted With</TableHead>
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

          {/* Footer with pagination */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Show</span>
              <Select value={String(perPage)} onValueChange={(v) => setPerPage(Number(v))}>
                <SelectTrigger className="h-7 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50].map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">per page</span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              Item 1 to {Math.min(perPage, total)}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
