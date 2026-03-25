'use client';

/* ═══════════════════════════════════════════════════════════
 * Explorer UI Components — Solscan-style primitives
 *
 * Shared components used across all explorer detail pages:
 * timestamps, copyable fields, Solscan links, tx status,
 * instruction views, DID identity badges, account tables.
 * ═══════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { cn } from '~/lib/utils';
import {
  Copy,
  Check,
  ExternalLink,
  Clock,
  Hash,
  Fingerprint,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

/* ── Timestamp Display ───────────────────────── */
/** Solscan-style: "Mar 13, 2026 14:32:05 UTC · 2 minutes ago · Unix: 1773698525" */
export function TimestampDisplay({
  unixSeconds,
  className,
  compact = false,
}: {
  unixSeconds: string | number | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  const ts = Number(unixSeconds);
  if (!ts || ts === 0) return <span className={cn('text-white/20 text-[12px]', className)}>—</span>;

  const date = new Date(ts * 1000);
  const now = Date.now();
  const diff = now - date.getTime();

  const relativeTime = (() => {
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  })();

  const absolute = date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  });

  if (compact) {
    return (
      <span className={cn('text-[12px] text-white/50 tabular-nums', className)} title={`${absolute}\nUnix: ${ts}`}>
        {relativeTime}
      </span>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-[12px]', className)}>
      <Clock className="h-3 w-3 text-white/20 shrink-0" />
      <span className="text-white/60 tabular-nums">{absolute}</span>
      <span className="text-white/15">·</span>
      <span className="text-blue-400/60 tabular-nums">{relativeTime}</span>
      <span className="text-white/15">·</span>
      <span className="text-white/20 font-mono text-[10px]">Unix: {ts}</span>
    </div>
  );
}

/* ── Copyable Field (Solscan-style data row) ── */
export function CopyableField({
  label,
  value,
  mono = true,
  className,
  href,
  external,
  truncate: shouldTruncate = false,
}: {
  label: string;
  value: string | React.ReactNode;
  mono?: boolean;
  className?: string;
  href?: string;
  external?: boolean;
  truncate?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const stringValue = typeof value === 'string' ? value : null;

  const handleCopy = () => {
    if (!stringValue) return;
    navigator.clipboard.writeText(stringValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const displayValue = shouldTruncate && stringValue && stringValue.length > 24
    ? `${stringValue.slice(0, 12)}…${stringValue.slice(-8)}`
    : value;

  return (
    <div className={cn('flex items-start justify-between gap-4 py-2.5 border-b border-white/[0.03] last:border-0', className)}>
      <span className="text-[12px] text-white/30 shrink-0 min-w-[120px]">{label}</span>
      <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
        {href ? (
          <a
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className={cn(
              'text-[12px] text-blue-400/70 hover:text-blue-400 transition-colors truncate',
              mono && 'font-mono',
            )}
            title={stringValue ?? undefined}
          >
            {displayValue}
            {external && <ExternalLink className="inline h-3 w-3 ml-1 -mt-0.5" />}
          </a>
        ) : (
          <span
            className={cn(
              'text-[12px] text-white/70 truncate',
              mono && 'font-mono',
            )}
            title={stringValue ?? undefined}
          >
            {displayValue}
          </span>
        )}
        {stringValue && (
          <button
            onClick={handleCopy}
            className="shrink-0 rounded-lg p-1 text-white/15 hover:text-white/40 hover:bg-white/[0.04] transition-all duration-micro ease-out-smooth"
            title="Copy"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Solscan Link ────────────────────────────── */
export function SolscanLink({
  type,
  value,
  label,
  className,
}: {
  type: 'tx' | 'account' | 'block' | 'token';
  value: string;
  label?: string;
  className?: string;
}) {
  const base = 'https://solscan.io';
  const path = type === 'tx' ? `/tx/${value}` : type === 'block' ? `/block/${value}` : `/${type}/${value}`;
  const display = label ?? (value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value);

  return (
    <a
      href={`${base}${path}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1 text-[11px] text-blue-400/70 hover:text-blue-400 transition-colors font-mono', className)}
      title={`View on Solscan: ${value}`}
    >
      {display}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

/* ── TX Status Badge ─────────────────────────── */
export function TxStatusBadge({ success, className }: { success: boolean; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
      success
        ? 'bg-emerald-500/[0.08] text-emerald-400 border border-emerald-500/10'
        : 'bg-red-500/[0.08] text-red-400 border border-red-500/10',
      className,
    )}>
      <span className={cn(
        'h-1.5 w-1.5 rounded-full',
        success ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.4)]' : 'bg-red-400 shadow-[0_0_4px_rgba(248,113,113,0.4)]',
      )} />
      {success ? 'Success' : 'Failed'}
    </span>
  );
}

/* ── DID Identity Badge ──────────────────────── */
export function DIDIdentity({
  agentId,
  agentUri,
  wallet,
  className,
}: {
  agentId?: string | null;
  agentUri?: string | null;
  wallet?: string | null;
  className?: string;
}) {
  const hasDID = agentId || agentUri;

  return (
    <div className={cn('rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4', className)}>
      <div className="flex items-center gap-2 mb-3">
        <Fingerprint className="h-4 w-4 text-violet-400" />
        <h3 className="text-[12px] font-semibold text-white">Decentralized Identity (DID)</h3>
      </div>

      {hasDID ? (
        <div className="space-y-0">
          {agentId && (
            <CopyableField label="Agent ID" value={agentId} />
          )}
          {agentUri && (
            <CopyableField
              label="Agent URI"
              value={agentUri}
              href={agentUri.startsWith('http') ? agentUri : undefined}
              external={agentUri.startsWith('http')}
            />
          )}
          {wallet && (
            <CopyableField label="Wallet (Authority)" value={wallet} truncate />
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
          <span className="text-[12px] text-white/25">No DID registered on-chain</span>
          {wallet && (
            <span className="text-[10px] text-white/15 font-mono ml-auto">{wallet.slice(0, 8)}…</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Slot / Block Display ────────────────────── */
export function SlotDisplay({ slot, className }: { slot: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-[12px] font-mono tabular-nums text-white/60', className)}>
      <Hash className="h-3 w-3 text-white/20" />
      {slot.toLocaleString()}
    </span>
  );
}

/* ── Fee Display ─────────────────────────────── */
export function FeeDisplay({ lamports, className }: { lamports: number; className?: string }) {
  const sol = lamports / 1e9;
  return (
    <span className={cn('text-[12px] tabular-nums text-white/60', className)}>
      {sol < 0.001 ? `${lamports.toLocaleString()} lamports` : `${sol.toFixed(6)} SOL`}
      {sol >= 0.001 && (
        <span className="text-white/20 ml-1">({lamports.toLocaleString()} lamports)</span>
      )}
    </span>
  );
}

/* ── Instruction View ────────────────────────── */
export function InstructionView({
  instruction,
  index,
  className,
}: {
  instruction: {
    programId: string;
    program?: string;
    type?: string;
    data?: string;
    accounts?: string[];
    parsed?: Record<string, unknown>;
    innerInstructions?: Array<{
      programId: string;
      program?: string;
      type?: string;
      parsed?: Record<string, unknown>;
    }>;
  };
  index: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);

  return (
    <div className={cn('rounded-xl border border-white/[0.04] bg-white/[0.01] overflow-hidden', className)}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/[0.04] text-[10px] font-mono text-white/40 shrink-0">
          #{index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {instruction.program && (
              <span className="badge-blue text-[9px]">{instruction.program}</span>
            )}
            {instruction.type && (
              <span className="badge-emerald text-[9px]">{instruction.type}</span>
            )}
          </div>
          <span className="text-[10px] font-mono text-white/25 mt-0.5 block truncate">
            {instruction.programId}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-white/20 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-white/20 shrink-0" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-white/[0.03] px-4 py-3 space-y-2">
          <CopyableField label="Program ID" value={instruction.programId} truncate />

          {instruction.parsed && Object.keys(instruction.parsed).length > 0 && (
            <div className="mt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25 block mb-2">Parsed Data</span>
              <pre className="text-[10px] font-mono text-white/50 bg-black/20 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {JSON.stringify(instruction.parsed, null, 2)}
              </pre>
            </div>
          )}

          {instruction.data && (
            <div className="mt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25 block mb-1">Raw Data</span>
              <p className="text-[10px] font-mono text-white/30 break-all">{instruction.data}</p>
            </div>
          )}

          {instruction.accounts && instruction.accounts.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowAccounts(!showAccounts)}
                className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/30 hover:text-white/50 transition-colors"
              >
                {showAccounts ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Accounts ({instruction.accounts.length})
              </button>
              {showAccounts && (
                <div className="mt-1 space-y-0.5 ml-3">
                  {instruction.accounts.map((acc, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[9px] text-white/15 w-4 text-right">{i}</span>
                      <a href={`/address/${acc}`} className="text-[10px] font-mono text-blue-400/60 hover:text-blue-400 transition-colors truncate">
                        {acc.length > 20 ? `${acc.slice(0, 8)}…${acc.slice(-6)}` : acc}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Inner instructions */}
          {instruction.innerInstructions && instruction.innerInstructions.length > 0 && (
            <div className="mt-2 border-t border-white/[0.03] pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25 block mb-2">
                Inner Instructions ({instruction.innerInstructions.length})
              </span>
              <div className="space-y-1 ml-3">
                {instruction.innerInstructions.map((inner, i) => (
                  <div key={i} className="rounded-lg border border-white/[0.03] bg-white/[0.01] p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-white/15">↳ {i}</span>
                      {inner.program && <span className="badge-cyan text-[8px]">{inner.program}</span>}
                      {inner.type && <span className="text-[9px] text-white/35">{inner.type}</span>}
                    </div>
                    <span className="text-[9px] font-mono text-white/20 mt-0.5 block truncate">{inner.programId}</span>
                    {inner.parsed && (
                      <pre className="text-[9px] font-mono text-white/30 mt-1 break-all max-h-20 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
                        {JSON.stringify(inner.parsed, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── On-Chain Data Section (collapsible raw data) ── */
export function OnChainDataSection({
  title = 'On-Chain Account Data',
  data,
  className,
}: {
  title?: string;
  data: Record<string, unknown>;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn('rounded-2xl border border-white/[0.05] bg-white/[0.02] overflow-hidden', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-white/30" /> : <ChevronRight className="h-3 w-3 text-white/30" />}
        <span className="text-[12px] font-semibold text-white/60">{title}</span>
        <span className="text-[9px] text-white/15 ml-auto">{Object.keys(data).length} fields</span>
      </button>
      {expanded && (
        <div className="border-t border-white/[0.03] px-4 py-3">
          <pre className="text-[10px] font-mono text-white/50 bg-black/20 rounded-lg p-3 overflow-x-auto max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ── Section Header ──────────────────────────── */
export function SectionHeader({ title, count, children, className }: {
  title: string;
  count?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      <div className="flex items-center gap-2">
        <h2 className="text-[14px] font-semibold text-white">{title}</h2>
        {count !== undefined && (
          <span className="rounded-lg bg-white/[0.04] px-2 py-0.5 text-[10px] tabular-nums text-white/30">{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── Detail Page Shell ───────────────────────── */
export function DetailPageShell({
  backHref,
  backLabel,
  title,
  subtitle,
  badges,
  children,
  icon,
  onBack,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string;
  badges?: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ReactNode;
  onBack?: () => void;
}) {
  const backElement = onBack ? (
    <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60 transition-colors">
      <ChevronRight className="h-3 w-3 rotate-180" /> {backLabel}
    </button>
  ) : (
    <a href={backHref} className="mb-4 flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60 transition-colors">
      <ChevronRight className="h-3 w-3 rotate-180" /> {backLabel}
    </a>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        {backElement}
        <div className="flex items-start gap-4">
          {icon && (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-white">{title}</h1>
              {badges}
            </div>
            {subtitle && <p className="mt-1 text-[13px] text-white/30">{subtitle}</p>}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
