'use client';

/* ═══════════════════════════════════════════════════════════
 * Explorer UI Components — shadcn-based detail page primitives
 * ═══════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import {
  Copy,
  Check,
  ExternalLink,
  Clock,
  Hash,
  Fingerprint,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';

/* ── Timestamp Display ───────────────────────── */
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
  if (!ts || ts === 0) return <span className={cn('text-muted-foreground text-xs', className)}>—</span>;

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
      <span className={cn('text-xs text-muted-foreground tabular-nums', className)} title={`${absolute}\nUnix: ${ts}`}>
        {relativeTime}
      </span>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-xs', className)}>
      <Clock className="h-3 w-3 text-muted-foreground/60 shrink-0" />
      <span className="text-foreground/70 tabular-nums">{absolute}</span>
      <span className="text-muted-foreground/30">·</span>
      <span className="text-primary/70 tabular-nums">{relativeTime}</span>
      <span className="text-muted-foreground/30">·</span>
      <span className="text-muted-foreground font-mono text-[10px]">Unix: {ts}</span>
    </div>
  );
}

/* ── Copyable Field ──────────────────────────── */
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
    <div className={cn('flex items-start justify-between gap-4 py-2.5 border-b border-border/50 last:border-0', className)}>
      <span className="text-xs text-muted-foreground shrink-0 min-w-[120px]">{label}</span>
      <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
        {href ? (
          <a
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className={cn(
              'text-xs text-primary/80 hover:text-primary transition-colors truncate',
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
              'text-xs text-foreground/80 truncate',
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
            className="shrink-0 rounded-md p-1 text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-all"
            title="Copy"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
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
      className={cn('inline-flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors font-mono', className)}
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
    <Badge
      variant={success ? 'default' : 'destructive'}
      className={cn(
        'gap-1.5 text-[10px] font-semibold uppercase tracking-wider',
        success
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
          : 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/20',
        className,
      )}
    >
      <span className={cn(
        'h-1.5 w-1.5 rounded-full',
        success ? 'bg-emerald-500' : 'bg-red-500',
      )} />
      {success ? 'Success' : 'Failed'}
    </Badge>
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
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Fingerprint className="h-4 w-4 text-primary" />
          Decentralized Identity (DID)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {hasDID ? (
          <div className="space-y-0">
            {agentId && <CopyableField label="Agent ID" value={agentId} />}
            {agentUri && (
              <CopyableField
                label="Agent URI"
                value={agentUri}
                href={agentUri.startsWith('http') ? agentUri : undefined}
                external={agentUri.startsWith('http')}
              />
            )}
            {wallet && <CopyableField label="Wallet (Authority)" value={wallet} truncate />}
          </div>
        ) : (
          <div className="flex items-center gap-2 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
            <span className="text-xs text-muted-foreground">No DID registered on-chain</span>
            {wallet && (
              <span className="text-[10px] text-muted-foreground/60 font-mono ml-auto">{wallet.slice(0, 8)}…</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Slot / Block Display ────────────────────── */
export function SlotDisplay({ slot, className }: { slot: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-mono tabular-nums text-foreground/70', className)}>
      <Hash className="h-3 w-3 text-muted-foreground/50" />
      {slot.toLocaleString()}
    </span>
  );
}

/* ── Fee Display ─────────────────────────────── */
export function FeeDisplay({ lamports, className }: { lamports: number; className?: string }) {
  const sol = lamports / 1e9;
  return (
    <span className={cn('text-xs tabular-nums text-foreground/70', className)}>
      {sol < 0.001 ? `${lamports.toLocaleString()} lamports` : `${sol.toFixed(6)} SOL`}
      {sol >= 0.001 && (
        <span className="text-muted-foreground ml-1">({lamports.toLocaleString()} lamports)</span>
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
    <Card className={cn('overflow-hidden', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[10px] font-mono text-muted-foreground shrink-0">
          #{index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {instruction.program && (
              <Badge variant="default" className="text-[9px]">{instruction.program}</Badge>
            )}
            {instruction.type && (
              <Badge variant="secondary" className="text-[9px]">{instruction.type}</Badge>
            )}
          </div>
          <span className="text-[10px] font-mono text-muted-foreground mt-0.5 block truncate">
            {instruction.programId}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <CopyableField label="Program ID" value={instruction.programId} truncate />

          {instruction.parsed && Object.keys(instruction.parsed).length > 0 && (
            <div className="mt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Parsed Data</span>
              <pre className="text-[10px] font-mono text-foreground/70 bg-muted rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {JSON.stringify(instruction.parsed, null, 2)}
              </pre>
            </div>
          )}

          {instruction.data && (
            <div className="mt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Raw Data</span>
              <p className="text-[10px] font-mono text-muted-foreground break-all">{instruction.data}</p>
            </div>
          )}

          {instruction.accounts && instruction.accounts.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowAccounts(!showAccounts)}
                className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAccounts ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Accounts ({instruction.accounts.length})
              </button>
              {showAccounts && (
                <div className="mt-1 space-y-0.5 ml-3">
                  {instruction.accounts.map((acc, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground/50 w-4 text-right">{i}</span>
                      <a href={`/address/${acc}`} className="text-[10px] font-mono text-primary/70 hover:text-primary transition-colors truncate">
                        {acc.length > 20 ? `${acc.slice(0, 8)}…${acc.slice(-6)}` : acc}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {instruction.innerInstructions && instruction.innerInstructions.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                Inner Instructions ({instruction.innerInstructions.length})
              </span>
              <div className="space-y-1 ml-3">
                {instruction.innerInstructions.map((inner, i) => (
                  <div key={i} className="rounded-md border border-border bg-muted/50 p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground/50">↳ {i}</span>
                      {inner.program && <Badge variant="outline" className="text-[8px]">{inner.program}</Badge>}
                      {inner.type && <span className="text-[9px] text-muted-foreground">{inner.type}</span>}
                    </div>
                    <span className="text-[9px] font-mono text-muted-foreground/60 mt-0.5 block truncate">{inner.programId}</span>
                    {inner.parsed && (
                      <pre className="text-[9px] font-mono text-muted-foreground/70 mt-1 break-all max-h-20 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
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
    </Card>
  );
}

/* ── On-Chain Data Section ───────────────────── */
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
    <Card className={cn('overflow-hidden', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        <span className="text-sm font-medium text-foreground/80">{title}</span>
        <span className="text-xs text-muted-foreground ml-auto">{Object.keys(data).length} fields</span>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-3">
          <pre className="text-[10px] font-mono text-foreground/70 bg-muted rounded-lg p-3 overflow-x-auto max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </Card>
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
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {count !== undefined && (
          <Badge variant="secondary" className="text-[10px] tabular-nums">{count}</Badge>
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
    <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 gap-1.5 text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-3 w-3" /> {backLabel}
    </Button>
  ) : (
    <Button variant="ghost" size="sm" asChild className="mb-4 gap-1.5 text-muted-foreground hover:text-foreground">
      <a href={backHref}>
        <ArrowLeft className="h-3 w-3" /> {backLabel}
      </a>
    </Button>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        {backElement}
        <div className="flex items-start gap-4">
          {icon && (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-foreground">{title}</h1>
              {badges}
            </div>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
