'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Wallet, Activity } from 'lucide-react';
import { Skeleton } from '~/components/ui';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '~/components/ui/table';
import {
  CopyableField,
  TimestampDisplay,
  SolscanLink,
  OnChainDataSection,
  SectionHeader,
  DetailPageShell,
} from '~/components/ui/explorer';
import { useEscrow, useAddressEvents, type SapEvent } from '~/hooks/use-sap';
import { AgentTag } from '~/components/ui/agent-tag';
import { formatTokenAmount } from '~/lib/format';

export default function EscrowDetailPage() {
  const { pda } = useParams<{ pda: string }>();
  const router = useRouter();
  const { data, loading } = useEscrow(pda);
  const { data: eventsData, loading: evLoading } = useAddressEvents(pda, { limit: 50 });

  const escrow = data?.escrow ?? null;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Escrow not found: {pda}</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.push('/escrows')}>
          <ArrowLeft className="h-3 w-3 mr-1" /> All Escrows
        </Button>
      </div>
    );
  }

  const dec = escrow.tokenDecimals ?? 9;
  const formatAmount = (v: string | number) => formatTokenAmount(v, dec);
  const balance = Number(escrow.balance);
  const isExpired = escrow.expiresAt !== '0' && Number(escrow.expiresAt) * 1000 < Date.now();
  const hasBalance = balance > 0;

  return (
    <DetailPageShell
      backHref="/escrows"
      backLabel="All Escrows"
      title="Escrow Account"
      subtitle={`${escrow.pda.slice(0, 12)}…${escrow.pda.slice(-8)}`}
      onBack={() => router.push('/escrows')}
      badges={
        <>
          {isExpired ? (
            <Badge variant="destructive">Expired</Badge>
          ) : hasBalance ? (
            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Funded</Badge>
          ) : (
            <Badge variant="secondary">Empty</Badge>
          )}
        </>
      }
      icon={
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-chart-4/10">
          <Wallet className="h-5 w-5 text-chart-4" />
        </div>
      }
    >
      {/* Balance Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-6 text-center">
          <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatAmount(escrow.balance)}</p>
          <p className="text-xs text-muted-foreground">Current Balance</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-lg font-bold tabular-nums text-foreground">{formatAmount(escrow.totalDeposited)}</p>
          <p className="text-xs text-muted-foreground">Total Deposited</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-lg font-bold tabular-nums text-foreground">{formatAmount(escrow.totalSettled)}</p>
          <p className="text-xs text-muted-foreground">Total Settled</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-lg font-bold tabular-nums text-foreground">{Number(escrow.totalCallsSettled).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Calls Settled</p>
        </CardContent></Card>
      </div>

      {/* Account Info */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Account Information" />
          <CopyableField label="Escrow PDA" value={escrow.pda} />
          <CopyableField label="Agent (seller)" value={escrow.agent} href={`/address/${escrow.agent}`} />
          <div className="ml-[120px] -mt-1 mb-2">
            <AgentTag address={escrow.agent} className="text-xs" truncate={false} />
          </div>
          <CopyableField label="Agent Wallet" value={escrow.agentWallet} href={`/address/${escrow.agentWallet}`} />
          <div className="ml-[120px] -mt-1 mb-2">
            <AgentTag address={escrow.agentWallet} className="text-xs" truncate={false} />
          </div>
          <CopyableField label="Depositor (buyer)" value={escrow.depositor} href={`/address/${escrow.depositor}`} />
          <div className="ml-[120px] -mt-1 mb-2">
            <AgentTag address={escrow.depositor} className="text-xs" truncate={false} />
          </div>
          {escrow.tokenMint && <CopyableField label="Token Mint" value={escrow.tokenMint} href={`/address/${escrow.tokenMint}`} />}
          <CopyableField label="Token Decimals" value={String(escrow.tokenDecimals)} mono={false} />
          <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/50">
            <span className="text-xs text-muted-foreground shrink-0 min-w-[120px]">Solscan</span>
            <SolscanLink type="account" value={escrow.pda} label="View on Solscan →" />
          </div>
        </CardContent>
      </Card>

      {/* Pricing */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Pricing Configuration" />
          <CopyableField label="Price Per Call" value={`${formatAmount(escrow.pricePerCall)} tokens`} mono={false} />
          <CopyableField label="Max Calls" value={escrow.maxCalls === '0' ? '∞ (Unlimited)' : Number(escrow.maxCalls).toLocaleString()} mono={false} />
        </CardContent>
      </Card>

      {/* Volume Curve */}
      {escrow.volumeCurve && escrow.volumeCurve.length > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="px-4 pt-4 pb-2">
              <SectionHeader title="Volume Discount Curve" count={escrow.volumeCurve.length} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>After X Calls</TableHead>
                  <TableHead className="text-right">Price Per Call</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {escrow.volumeCurve.map((tier, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono tabular-nums text-muted-foreground">{Number(tier.afterCalls).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{formatAmount(tier.pricePerCall)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Timestamps" />
          <div className="space-y-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Created</span>
              <TimestampDisplay unixSeconds={escrow.createdAt} />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Last Settled</span>
              <TimestampDisplay unixSeconds={escrow.lastSettledAt} />
            </div>
            {escrow.expiresAt !== '0' && (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Expires</span>
                <TimestampDisplay unixSeconds={escrow.expiresAt} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <OnChainDataSection title="Raw Escrow Account (On-Chain)" data={escrow as unknown as Record<string, unknown>} />

      {/* Event Timeline */}
      <EscrowEventTimeline events={eventsData?.events ?? []} loading={evLoading} />
    </DetailPageShell>
  );
}

/* ── Escrow Event Timeline component ───────────── */

const ESCROW_EVENT_COLORS: Record<string, string> = {
  EscrowCreatedEvent:   'text-emerald-500',
  EscrowDepositedEvent: 'text-blue-500',
  PaymentSettledEvent:  'text-primary',
  BatchSettledEvent:    'text-primary',
  EscrowWithdrawnEvent: 'text-amber-500',
};

const ESCROW_EVENT_SHORT: Record<string, string> = {
  EscrowCreatedEvent:   'Created',
  EscrowDepositedEvent: 'Deposited',
  PaymentSettledEvent:  'Settled',
  BatchSettledEvent:    'Batch Settled',
  EscrowWithdrawnEvent: 'Withdrawn',
};

function EscrowEventTimeline({
  events,
  loading,
}: {
  events: SapEvent[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Event Timeline" />
          <Skeleton className="h-24 w-full mt-2" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <SectionHeader title="Event Timeline" count={events.length} />
        {events.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Activity className="h-4 w-4 shrink-0" />
            <span>No events found for this escrow on-chain.</span>
          </div>
        ) : (
          <div className="relative space-y-0 mt-3">
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
            {events.map((ev, i) => {
              const color = ESCROW_EVENT_COLORS[ev.name] ?? 'text-muted-foreground';
              const short = ESCROW_EVENT_SHORT[ev.name] ?? ev.name.replace('Event', '');
              return (
                <div key={i} className="relative flex items-start gap-3 py-2">
                  <div className={`relative z-10 mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-background border border-border ${color}`}>
                    <Activity className="h-2.5 w-2.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold ${color}`}>{short}</span>
                      {ev.data?.callsSettled !== undefined && Number(ev.data.callsSettled) > 0 && (
                        <Badge variant="secondary" className="text-xs h-4">{Number(ev.data.callsSettled)} calls</Badge>
                      )}
                      {ev.data?.amount !== undefined && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {(Number(ev.data.amount) / 1e9).toFixed(6)} SOL
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {ev.blockTime && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.blockTime * 1000).toLocaleString()}
                        </span>
                      )}
                      {ev.txSignature && (
                        <a
                          href={`/tx/${ev.txSignature}`}
                          className="text-xs font-mono text-primary/70 hover:text-primary transition-colors"
                        >
                          {ev.txSignature.slice(0, 8)}…
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
