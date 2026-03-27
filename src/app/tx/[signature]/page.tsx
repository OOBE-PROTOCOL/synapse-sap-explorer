'use client';

/* ═══════════════════════════════════════════════════════════
 * /tx/[signature] — Transaction Detail Page
 *
 * Solscan-inspired layout with:
 *   ▸ ⓘ info icons on every label row
 *   ▸ Instruction format: "#N - Program: Type" with Raw switch
 *   ▸ Per-instruction Compute Units distribution (parsed from logs)
 *   ▸ Agent PDA / Wallet resolution (links to /agents/[wallet])
 *   ▸ SOL ◎ and token icons on balance changes
 *   ▸ Collapsible sections with clean Solscan-style headers
 * ═══════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '~/lib/utils';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Skeleton } from '~/components/ui/skeleton';
import { Switch } from '~/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Info,
  AlertCircle,
} from 'lucide-react';

/* ════════════════════════════════════════════════════
 *  Types
 * ════════════════════════════════════════════════════ */

interface AccountKey { pubkey: string; signer: boolean; writable: boolean }

interface TxInstruction {
  programId: string;
  program: string | null;
  type: string | null;
  data: string | null;
  accounts: string[];
  parsed: Record<string, unknown> | null;
  decodedArgs: Record<string, any> | null;
  innerInstructions: TxInstruction[];
}

interface BalanceChange { account: string; pre: number; post: number; change: number }

interface TokenBalanceChange {
  account: string; mint: string; owner: string | null;
  preAmount: string; postAmount: string; decimals: number;
}

interface SapEvent { name: string; data: Record<string, any> }

interface TxDetail {
  signature: string;
  slot: number | null;
  blockTime: number | null;
  fee: number;
  status: string;
  error: any;
  confirmations: number | null;
  version: string;
  recentBlockhash: string | null;
  accountKeys: AccountKey[];
  instructions: TxInstruction[];
  logs: string[];
  events: SapEvent[];
  balanceChanges: BalanceChange[];
  tokenBalanceChanges: TokenBalanceChange[];
  computeUnitsConsumed: number | null;
}

/** wallet → { name, pda, score } from /api/sap/agents/map */
type AgentMap = Record<string, { name: string; pda: string; score: number }>;
/** address → agent display label (both wallet keys and PDA keys) */
type AddressLabels = Record<string, string>;

/* ════════════════════════════════════════════════════
 *  Constants & known addresses
 * ════════════════════════════════════════════════════ */

const SAP = 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';

const PROGRAMS: Record<string, string> = {
  '11111111111111111111111111111111':              'System Program',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA':  'Token Program',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb':  'Token-2022',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token Program',
  'ComputeBudget111111111111111111111111111111':    'Compute Budget',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo Program',
  'Memo1UhkJBfCR7GnRtJ5UcRPEMkY2DGqMGYAS8sEy6P': 'Memo v1',
  [SAP]:                                           'SAP Program',
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter v6',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8':'Raydium AMM',
};

/** Well-known token mints for icon + ticker display */
const TOKENS: Record<string, { symbol: string; icon: string; color: string }> = {
  'So11111111111111111111111111111111111111112':      { symbol: 'SOL',  icon: '◎', color: '#9945FF' },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v':  { symbol: 'USDC', icon: '$', color: '#2775CA' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB':   { symbol: 'USDT', icon: '₮', color: '#26A17B' },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So':   { symbol: 'mSOL', icon: '◎', color: '#C840E9' },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263':  { symbol: 'BONK', icon: 'B', color: '#F2A93B' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN':    { symbol: 'JUP',  icon: 'J', color: '#5AE4BF' },
};

/* ════════════════════════════════════════════════════
 *  Helpers
 * ════════════════════════════════════════════════════ */

function timeAgo(ts: number): string {
  const d = Math.floor(Date.now() / 1000 - ts);
  if (d < 5)     return 'just now';
  if (d < 60)    return `${d} secs ago`;
  if (d < 3600)  return `${Math.floor(d / 60)} mins ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hrs ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mo = months[d.getUTCMonth()];
  const day = d.getUTCDate();
  const yr = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${mo} ${day}, ${yr}, ${hh}:${mm}:${ss} UTC`;
}

function short(a: string, c = 8): string {
  return a.length <= c * 2 + 2 ? a : `${a.slice(0, c)}…${a.slice(-c)}`;
}

function progName(pid: string): string { return PROGRAMS[pid] ?? short(pid, 6); }

/**
 * Parse per-instruction Compute Units from transaction logs.
 * Looks for  "Program <addr> consumed X of Y compute units"
 * at depth [1] only (top-level instructions).
 */
function parsePerIxCU(logs: string[]): number[] {
  const cus: number[] = [];
  for (const line of logs) {
    const m = line.match(/^Program \S+ consumed (\d+) of \d+ compute units$/);
    if (m) cus.push(Number(m[1]));
  }
  return cus;
}

/* ════════════════════════════════════════════════════
 *  Micro-components
 * ════════════════════════════════════════════════════ */

/* ── Inline copy ── */
function Cp({ text, display, mono = true, className }: {
  text: string; display?: React.ReactNode; mono?: boolean; className?: string;
}) {
  const [ok, set] = useState(false);
  return (
    <span className={cn('inline-flex items-center gap-1.5 min-w-0', className)}>
      <span className={cn('break-all', mono && 'font-mono')} title={text}>
        {display ?? text}
      </span>
      <button
        onClick={() => { navigator.clipboard.writeText(text); set(true); setTimeout(() => set(false), 1400); }}
        className="shrink-0 rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/60 transition-all"
      >
        {ok ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}

/* ── Solscan external link icon ── */
function SolLink({ path, className }: { path: string; className?: string }) {
  return (
    <a href={`https://solscan.io${path}`} target="_blank" rel="noopener noreferrer"
       className={cn('text-primary/50 hover:text-primary transition-colors', className)}>
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

/* ── ⓘ  Info-icon label row (Solscan style) ── */
function Row({ label, tip, children }: {
  label: string; tip?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b border-border/40 last:border-0">
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-1.5 shrink-0 sm:w-[180px]">
          {tip ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[220px]">{tip}</TooltipContent>
            </Tooltip>
          ) : (
            <Info className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
          )}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </TooltipProvider>
      <div className="flex-1 min-w-0 text-xs break-all">{children}</div>
    </div>
  );
}

/* ── Agent label (shown when address matches a known agent) ── */
function AgentTag({ label, wallet }: { label: string; wallet: string }) {
  return (
    <Link href={`/agents/${wallet}`}
          className="inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/20 transition-colors">
      {label}
    </Link>
  );
}

/* ── Address display with optional agent resolution ── */
function Addr({ pubkey, labels, link = true }: {
  pubkey: string; labels: AddressLabels; link?: boolean;
}) {
  const agentLabel = labels[pubkey];
  const progLabel = PROGRAMS[pubkey];
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 flex-wrap">
      <Cp text={pubkey} className="text-xs" />
      {link && <SolLink path={`/account/${pubkey}`} />}
      {progLabel && (
        <span className="text-[10px] text-muted-foreground/60">({progLabel})</span>
      )}
      {agentLabel && <AgentTag label={agentLabel} wallet={pubkey} />}
    </span>
  );
}

/* ── Program icon (SAP logo / Solana gradient / colored initials) ── */
function ProgIcon({ pid, size = 20 }: { pid: string; size?: number }) {
  if (pid === SAP) {
    return (
      <span className="inline-flex items-center justify-center shrink-0 rounded-md bg-primary/10 ring-1 ring-primary/20"
            style={{ width: size, height: size }} title="SAP Program">
        <Image src="/images/synapse.png" alt="SAP" width={size - 4} height={size - 4} className="rounded-sm" />
      </span>
    );
  }
  const sol = ['11111111111111111111111111111111','TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb','ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL','ComputeBudget111111111111111111111111111111','MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr','Memo1UhkJBfCR7GnRtJ5UcRPEMkY2DGqMGYAS8sEy6P'];
  const known = PROGRAMS[pid];
  if (sol.includes(pid)) {
    const ab = known ? known.split(' ').map(w => w[0]).join('').slice(0, 2) : 'SP';
    return (
      <span className="inline-flex items-center justify-center shrink-0 rounded-md"
            style={{ width: size, height: size, background: 'linear-gradient(135deg,#9945FF,#14F195)' }} title={known ?? pid}>
        <span className="text-white font-bold" style={{ fontSize: size * 0.42 }}>{ab}</span>
      </span>
    );
  }
  const C = ['#22c55e','#f97316','#3b82f6','#a855f7','#eab308','#06b6d4'];
  let h = 0; for (let i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) | 0;
  const in2 = known ? known.split(' ').map(w => w[0]).join('').slice(0, 2) : pid.slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex items-center justify-center shrink-0 rounded-md text-white font-semibold"
          style={{ width: size, height: size, backgroundColor: C[Math.abs(h) % C.length], fontSize: size * 0.42 }} title={known ?? pid}>
      {in2}
    </span>
  );
}

/* ── Token icon (circle w/ symbol for known tokens, generic for unknown) ── */
function TokenIcon({ mint, size = 18 }: { mint: string; size?: number }) {
  const tk = TOKENS[mint];
  if (tk) {
    return (
      <span className="inline-flex items-center justify-center shrink-0 rounded-full text-white font-bold"
            style={{ width: size, height: size, backgroundColor: tk.color, fontSize: size * 0.5, lineHeight: 1 }}
            title={tk.symbol}>
        {tk.icon}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center shrink-0 rounded-full bg-muted text-muted-foreground font-mono"
          style={{ width: size, height: size, fontSize: 8, lineHeight: 1 }} title={mint}>
      ?
    </span>
  );
}

/* ════════════════════════════════════════════════════
 *  Collapsible section wrapper
 * ════════════════════════════════════════════════════ */

function Section({ title, count, open: initOpen = true, children }: {
  title: string; count?: number; open?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(initOpen);
  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen(!open)}
              className="flex items-center gap-2.5 w-full px-5 py-3.5 hover:bg-muted/30 transition-colors text-left">
        <span className="text-sm font-semibold text-foreground/90 flex-1">{title}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="text-[10px] tabular-nums mr-1">{count}</Badge>
        )}
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && <CardContent className="border-t border-border px-5 py-4">{children}</CardContent>}
    </Card>
  );
}

/* ════════════════════════════════════════════════════
 *  CU Distribution (per-instruction, Solscan style)
 * ════════════════════════════════════════════════════ */

const BAR_COLORS = [
  'bg-[#60A5FA]', 'bg-[#34D399]', 'bg-[#FBBF24]', 'bg-[#A78BFA]', 'bg-[#F87171]', 'bg-[#22D3EE]',
];
const DOT_COLORS = [
  'bg-blue-400', 'bg-emerald-400', 'bg-amber-400', 'bg-violet-400', 'bg-red-400', 'bg-cyan-400',
];

function CUDistribution({ instructions, cuPerIx, total }: {
  instructions: TxInstruction[]; cuPerIx: number[]; total: number | null;
}) {
  if (!total || cuPerIx.length === 0) return null;
  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Compute Units Distribution</span>
          <span className="text-xs font-medium text-foreground/80">
            Total: <span className="font-mono tabular-nums">{total.toLocaleString()}</span>
          </span>
        </div>

        {/* Stacked bar */}
        <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted">
          {cuPerIx.map((cu, i) => {
            const pct = (cu / total) * 100;
            if (pct < 0.3) return null;
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <div className={cn(BAR_COLORS[i % BAR_COLORS.length], 'h-full')}
                       style={{ width: `${pct}%` }} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Instruction #{i + 1}: {cu.toLocaleString()} CU ({pct.toFixed(1)}%)
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {cuPerIx.map((cu, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', DOT_COLORS[i % DOT_COLORS.length])} />
              <span className="text-[10px] text-muted-foreground">
                Instruction #{i + 1}:{' '}
                <span className="font-mono tabular-nums text-foreground/70">{cu.toLocaleString()}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ════════════════════════════════════════════════════
 *  Instruction row — Solscan formatsa
 *  "#N - Program Name: InstructionType"  [Raw ⬤ ] ▸
 * ════════════════════════════════════════════════════ */

function IxRow({ ix, index, cuUsed, labels, depth = 0 }: {
  ix: TxInstruction; index: number; cuUsed?: number;
  labels: AddressLabels; depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showRaw, setShowRaw] = useState(true);

  const prog = ix.program ?? progName(ix.programId);
  const action = ix.type ?? (ix.parsed?.type as string | undefined) ?? 'Unknown';

  return (
    <div className={cn(depth > 0 && 'ml-5 border-l-2 border-primary/15 pl-4')}>
      {/* ── collapsed row ── */}
      <div className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0">
        {/* CPI depth indicator */}
        {depth > 0 && (
          <span className="text-xs text-muted-foreground/50 font-mono shrink-0">↳</span>
        )}

        {/* Icon */}
        <ProgIcon pid={ix.programId} size={18} />

        {/* "#N - Program: Type" text */}
        <button onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity">
          <span className="text-xs font-medium text-foreground/85 truncate">
            <span className="text-muted-foreground/50 mr-1">#{index + 1} -</span>
            {prog}: <span className="text-foreground">{action}</span>
          </span>
        </button>

        {/* CU chip */}
        {cuUsed !== undefined && cuUsed > 0 && depth === 0 && (
          <span className="text-[9px] text-muted-foreground/50 font-mono tabular-nums shrink-0">
            {cuUsed.toLocaleString()} CU
          </span>
        )}

        {/* CPI count */}
        {ix.innerInstructions.length > 0 && (
          <Badge variant="outline" className="text-[8px] shrink-0">{ix.innerInstructions.length} CPI</Badge>
        )}

        {/* Raw toggle */}
        {ix.data && depth === 0 && (
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] text-muted-foreground/50">Raw</span>
            <Switch checked={showRaw} onCheckedChange={setShowRaw} className="scale-75" />
          </div>
        )}

        {/* Expand chevron */}
        <button onClick={() => setExpanded(!expanded)} className="shrink-0 p-0.5">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
      </div>

      {/* ── raw data (inline below row, no expand needed) ── */}
      {showRaw && ix.data && (
        <div className="bg-muted/40 rounded-lg p-3 my-1 mx-8">
          <pre className="text-[10px] font-mono text-muted-foreground/70 break-all whitespace-pre-wrap max-h-28 overflow-y-auto"
               style={{ scrollbarWidth: 'thin' }}>
            {ix.data}
          </pre>
        </div>
      )}

      {/* ── expanded detail ── */}
      {expanded && (
        <div className="pb-3 pl-10 space-y-3">
          {/* Program address */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-muted-foreground/60 w-20 shrink-0">Program</span>
            <Addr pubkey={ix.programId} labels={labels} />
          </div>

          {/* Decoded arguments (SAP instructions) */}
          {ix.decodedArgs && Object.keys(ix.decodedArgs).length > 0 && (
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 block mb-2">
                Decoded Arguments
              </span>
              <div className="space-y-1">
                {Object.entries(ix.decodedArgs).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-3 text-[10px]">
                    <span className="text-muted-foreground font-mono shrink-0 w-36">{k}</span>
                    <span className="text-foreground/80 font-mono break-all">
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parsed data (non-SAP native instructions) */}
          {ix.parsed && Object.keys(ix.parsed).length > 0 && !ix.decodedArgs && (
            <div className="rounded-lg bg-muted/50 p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                Parsed Data
              </span>
              <pre className="text-[10px] font-mono text-foreground/70 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap"
                   style={{ scrollbarWidth: 'thin' }}>
                {JSON.stringify(ix.parsed, null, 2)}
              </pre>
            </div>
          )}

          {/* Account inputs */}
          {ix.accounts.length > 0 && (
            <AccountList accounts={ix.accounts} labels={labels} />
          )}

          {/* Inner instructions (recursive) */}
          {ix.innerInstructions.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                ↳ Inner Instructions ({ix.innerInstructions.length})
              </span>
              {ix.innerInstructions.map((inner, i) => (
                <IxRow key={i} ix={inner} index={i} labels={labels} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Account list (collapsible sub-section) ── */
function AccountList({ accounts, labels }: { accounts: string[]; labels: AddressLabels }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen(!open)}
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Account Inputs ({accounts.length})
      </button>
      {open && (
        <div className="mt-2 space-y-0.5 ml-1">
          {accounts.map((acc, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px]">
              <span className="text-muted-foreground/50 w-5 text-right tabular-nums">{i}</span>
              <Addr pubkey={acc} labels={labels} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
 *  Log coloring
 * ════════════════════════════════════════════════════ */

function logCls(l: string): string {
  if (l.startsWith('Program') && l.includes('invoke'))   return 'text-primary';
  if (l.startsWith('Program') && l.includes('success'))  return 'text-emerald-400';
  if (l.includes('failed') || l.includes('Error'))       return 'text-red-400';
  if (l.includes('Program data:'))                       return 'text-amber-400';
  if (l.includes('consumed'))                            return 'text-cyan-400/70';
  if (l.includes('Program log:'))                        return 'text-foreground/60';
  return 'text-muted-foreground/50';
}

/* ════════════════════════════════════════════════════
 *                    PAGE
 * ════════════════════════════════════════════════════ */

export default function TransactionDetailPage() {
  const { signature } = useParams<{ signature: string }>();
  const router = useRouter();

  const [tx, setTx]           = useState<TxDetail | null>(null);
  const [agents, setAgents]   = useState<AgentMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  /* ── fetch tx + agents in parallel ── */
  const load = useCallback(async () => {
    try {
      const [txRes, agRes] = await Promise.all([
        fetch(`/api/sap/tx/${signature}`),
        fetch('/api/sap/agents/map').catch(() => null),
      ]);
      if (!txRes.ok) {
        const j = await txRes.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${txRes.status}`);
      }
      setTx(await txRes.json());
      if (agRes?.ok) {
        const map = await agRes.json();
        if (map && typeof map === 'object' && !map.error) setAgents(map);
      }
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch transaction');
    } finally {
      setLoading(false);
    }
  }, [signature]);

  useEffect(() => { load(); }, [load]);

  /* ── Build address → label map (wallet + PDA) ── */
  const labels: AddressLabels = {};
  for (const [wallet, info] of Object.entries(agents)) {
    if (info.name) {
      labels[wallet] = info.name;          // wallet key → agent name
      if (info.pda) labels[info.pda] = info.name; // PDA key → agent name
    }
  }

  /* ── States ── */
  if (loading) {
    return (
      <div className="space-y-5 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px] w-full rounded-xl" />
        <Skeleton className="h-[140px] w-full rounded-xl" />
        <Skeleton className="h-[90px] w-full rounded-xl" />
      </div>
    );
  }
  if (error || !tx) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-destructive/50 mb-4" />
        <h2 className="text-lg font-semibold text-foreground/80 mb-2">Transaction Not Found</h2>
        <p className="text-sm text-muted-foreground max-w-md">{error}</p>
        <Button variant="ghost" className="mt-6 gap-2" onClick={() => router.push('/transactions')}>
          <ArrowLeft className="h-4 w-4" /> Back to Transactions
        </Button>
      </div>
    );
  }

  /* ── Derived ── */
  const ok        = tx.status === 'success';
  const feeSol    = tx.fee / 1e9;
  const signer    = tx.accountKeys.find(k => k.signer)?.pubkey ?? '—';
  const action    = tx.instructions.find(ix => ix.type)?.type ?? null;
  const hasSap    = tx.instructions.some(ix => ix.programId === SAP);
  const cuPerIx   = parsePerIxCU(tx.logs);
  const solDeltas = tx.balanceChanges.filter(b => b.change !== 0);

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ═══ HEADER ═══ */}
      <div>
        <Button variant="ghost" size="sm" className="mb-3 gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => router.push('/transactions')}>
          <ArrowLeft className="h-3 w-3" /> Transactions
        </Button>

        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-semibold text-foreground">Transaction Details</h1>
          <Badge className={cn('gap-1 text-[9px] font-semibold uppercase tracking-wider',
            ok ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
               : 'bg-red-500/15 text-red-400 border-red-500/20')}>
            <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-emerald-500' : 'bg-red-500')} />
            {ok ? 'SUCCESS' : 'FAILED'}
          </Badge>
          <Badge variant="outline" className="text-[9px] text-muted-foreground">Finalized</Badge>
        </div>

        {/* Ribbon */}
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground flex-wrap">
          {action && <span className="text-primary font-medium">{action}</span>}
          {hasSap && !action && <span className="text-primary font-medium">SAP Transaction</span>}
          <span className="text-muted-foreground/30">·</span>
          <span>Fee: ◎ {feeSol.toFixed(6)}</span>
          {tx.computeUnitsConsumed != null && (
            <><span className="text-muted-foreground/30">·</span><span>{tx.computeUnitsConsumed.toLocaleString()} CU</span></>
          )}
          {tx.blockTime && (
            <><span className="text-muted-foreground/30">·</span><span>{timeAgo(tx.blockTime)}</span></>
          )}
        </div>
      </div>

      {/* ═══ OVERVIEW ═══ */}
      <Section title="Overview">
        <div>
          <Row label="Signature" tip="Unique transaction hash">
            <Cp text={tx.signature} className="text-xs" />
          </Row>

          <Row label="Result" tip="Whether the transaction executed successfully">
            <div className="flex items-center gap-2">
              <Badge className={cn('gap-1 text-[9px] uppercase',
                ok ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                   : 'bg-red-500/15 text-red-400 border-red-500/20')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-emerald-500' : 'bg-red-500')} />
                {ok ? 'SUCCESS' : 'FAILED'}
              </Badge>
              <span className="text-[10px] text-muted-foreground">Finalized (MAX Confirmations)</span>
              {tx.error && <span className="text-[10px] text-red-400/70 font-mono ml-2">{JSON.stringify(tx.error)}</span>}
            </div>
          </Row>

          {tx.blockTime && (
            <Row label="Block & Timestamp" tip="Block slot and confirmation time">
              <div className="flex items-center gap-3 flex-wrap">
                {tx.slot != null && (
                  <a href={`https://solscan.io/block/${tx.slot}`} target="_blank" rel="noopener noreferrer"
                     className="font-mono text-primary/80 hover:text-primary tabular-nums">
                    {tx.slot}
                  </a>
                )}
                <Cp text={String(tx.slot ?? '')} display={<Copy className="h-2.5 w-2.5 text-muted-foreground/30" />} mono={false} className="text-[0px]" />
                <span className="text-muted-foreground/30">·</span>
                <span className="text-foreground/70 tabular-nums">{timeAgo(tx.blockTime)}</span>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-muted-foreground/70 tabular-nums">{fmtTime(tx.blockTime)}</span>
              </div>
            </Row>
          )}

          <Row label="Signer" tip="The fee payer / transaction authority">
            <Addr pubkey={signer} labels={labels} />
          </Row>

          <Row label="Fee" tip="Transaction fee paid to validators">
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-foreground/80">
              <span className="inline-flex items-center justify-center shrink-0 rounded-full h-4 w-4" style={{ background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)' }} title="SOL">
                <svg width="10" height="10" viewBox="0 0 397 312" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" fill="#fff"/>
                  <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="#fff"/>
                  <path d="M332.1 120c-2.4-2.4-5.7-3.8-9.2-3.8H5.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1L332.1 120z" fill="#fff"/>
                </svg>
              </span>
              {feeSol.toFixed(9)}{' '}
              <span className="text-muted-foreground">({tx.fee} lamports)</span>
            </span>
          </Row>

          {tx.computeUnitsConsumed != null && (
            <Row label="Compute Units Consumed" tip="Total compute budget used by this transaction">
              <span className="font-mono tabular-nums text-foreground/80">
                {tx.computeUnitsConsumed}
              </span>
            </Row>
          )}

          <Row label="Transaction Version" tip="Legacy or versioned transaction format">
            <span className="text-xs font-mono text-foreground/80">
              {tx.version === 'legacy' || tx.version === 'Legacy' ? 'Legacy' : tx.version}
            </span>
          </Row>

          {tx.recentBlockhash && (
            <Row label="Recent Block Hash" tip="Blockhash used to sign the transaction">
              <Cp text={tx.recentBlockhash} className="text-xs" />
            </Row>
          )}

          <Row label="View on Solscan" tip="Open this transaction on Solscan block explorer">
            <a href={`https://solscan.io/tx/${tx.signature}`} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors break-all">
              solscan.io/tx/{tx.signature} <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </Row>
        </div>
      </Section>

      {/* ═══ INSTRUCTION DETAILS ═══ */}
      <Section title="Instruction Details" count={tx.instructions.length}>
        <div className="space-y-4">
          {/* CU distribution */}
          <CUDistribution instructions={tx.instructions} cuPerIx={cuPerIx} total={tx.computeUnitsConsumed} />

          {cuPerIx.length > 0 && <Separator className="opacity-40" />}

          {/* Instruction rows */}
          <div>
            {tx.instructions.map((ix, i) => (
              <IxRow key={i} ix={ix} index={i} cuUsed={cuPerIx[i]} labels={labels} />
            ))}
          </div>
        </div>
      </Section>

      {/* ═══ SAP EVENTS ═══ */}
      {tx.events.length > 0 && (
        <Section title="SAP Events" count={tx.events.length} open={true}>
          <div className="space-y-2">
            {tx.events.map((evt, i) => (
              <div key={i} className="rounded-lg bg-muted/50 border border-border p-3">
                <Badge variant="secondary" className="text-[9px] font-mono">{evt.name}</Badge>
                {Object.keys(evt.data).length > 0 && (
                  <pre className="text-[10px] font-mono text-foreground/60 mt-2 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap"
                       style={{ scrollbarWidth: 'thin' }}>
                    {JSON.stringify(evt.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ═══ PROGRAM LOGS ═══ */}
      {tx.logs.length > 0 && (
        <Section title="Program Logs" count={tx.logs.length} open={true}>
          <div className="rounded-lg bg-muted/20 p-3 max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {tx.logs.map((line, i) => (
              <div key={i} className="flex gap-3 py-0.5 hover:bg-muted/30 rounded px-1 transition-colors">
                <span className="text-[9px] text-muted-foreground/30 font-mono tabular-nums shrink-0 w-6 text-right select-none">{i + 1}</span>
                <span className={cn('text-[10px] font-mono break-all', logCls(line))}>{line}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ═══ ACCOUNT INPUTS ═══ */}
      <Section title="Account Inputs" count={tx.accountKeys.length} open={true}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] w-8">#</TableHead>
                <TableHead className="text-[10px]">Address</TableHead>
                <TableHead className="text-[10px] w-20 text-center">Signer</TableHead>
                <TableHead className="text-[10px] w-20 text-center">Writable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tx.accountKeys.map((acc, i) => (
                <TableRow key={i} className="group">
                  <TableCell className="text-[10px] text-muted-foreground tabular-nums">{i}</TableCell>
                  <TableCell>
                    <Addr pubkey={acc.pubkey} labels={labels} />
                  </TableCell>
                  <TableCell className="text-center">
                    {acc.signer && (
                      <Badge className="text-[8px] bg-emerald-500/15 text-emerald-400 border-emerald-500/20 px-1.5">Yes</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {acc.writable && (
                      <Badge variant="secondary" className="text-[8px] px-1.5">Yes</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      {/* ═══ SOL BALANCE CHANGES ═══ */}
      {solDeltas.length > 0 && (
        <Section title="SOL Balance Changes" count={solDeltas.length} open={true}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px]">Address</TableHead>
                  <TableHead className="text-[10px] text-right">Before (SOL)</TableHead>
                  <TableHead className="text-[10px] text-right">After (SOL)</TableHead>
                  <TableHead className="text-[10px] text-right">Change (SOL)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solDeltas.map((b, i) => {
                  const ch = b.change / 1e9;
                  return (
                    <TableRow key={i}>
                      <TableCell><Addr pubkey={b.account} labels={labels} /></TableCell>
                      <TableCell className="text-right text-[10px] font-mono tabular-nums text-foreground/70">{(b.pre / 1e9).toFixed(9)}</TableCell>
                      <TableCell className="text-right text-[10px] font-mono tabular-nums text-foreground/70">{(b.post / 1e9).toFixed(9)}</TableCell>
                      <TableCell className={cn('text-right text-[10px] font-mono tabular-nums font-medium',
                        ch > 0 ? 'text-emerald-400' : ch < 0 ? 'text-red-400' : 'text-foreground/70')}>
                        {ch > 0 && '+'}{ch.toFixed(9)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Section>
      )}

      {/* ═══ TOKEN BALANCE CHANGES ═══ */}
      {tx.tokenBalanceChanges.length > 0 && (
        <Section title="Token Balance Changes" count={tx.tokenBalanceChanges.length} open={true}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] w-8" />
                  <TableHead className="text-[10px]">Account</TableHead>
                  <TableHead className="text-[10px]">Token</TableHead>
                  <TableHead className="text-[10px] text-right">Before</TableHead>
                  <TableHead className="text-[10px] text-right">After</TableHead>
                  <TableHead className="text-[10px] text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tx.tokenBalanceChanges.map((t, i) => {
                  const pre = parseFloat(t.preAmount);
                  const post = parseFloat(t.postAmount);
                  const ch = post - pre;
                  const tk = TOKENS[t.mint];
                  return (
                    <TableRow key={i}>
                      <TableCell className="pr-0"><TokenIcon mint={t.mint} /></TableCell>
                      <TableCell><Addr pubkey={t.account} labels={labels} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {tk
                            ? <span className="text-[10px] font-medium text-foreground/80">{tk.symbol}</span>
                            : <Cp text={t.mint} display={short(t.mint, 6)} className="text-[10px]" />}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-[10px] font-mono tabular-nums text-foreground/70">{t.preAmount}</TableCell>
                      <TableCell className="text-right text-[10px] font-mono tabular-nums text-foreground/70">{t.postAmount}</TableCell>
                      <TableCell className={cn('text-right text-[10px] font-mono tabular-nums font-medium',
                        ch > 0 ? 'text-emerald-400' : ch < 0 ? 'text-red-400' : 'text-foreground/70')}>
                        {ch > 0 && '+'}{ch.toFixed(t.decimals)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Section>
      )}
    </div>
  );
}
