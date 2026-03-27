'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Wallet } from 'lucide-react';
import { Skeleton, Address } from '~/components/ui';
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
import { useEscrows, useAgents } from '~/hooks/use-sap';

export default function EscrowDetailPage() {
  const { pda } = useParams<{ pda: string }>();
  const router = useRouter();
  const { data, loading: eLoading } = useEscrows();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });
  const loading = eLoading || aLoading;

  const escrow = useMemo(() => {
    if (!data?.escrows) return null;
    return data.escrows.find((e) => e.pda === pda) ?? null;
  }, [data, pda]);

  const agent = useMemo(() => {
    if (!escrow || !agentsData?.agents) return null;
    return agentsData.agents.find((a) => a.pda === escrow.agent) ?? null;
  }, [escrow, agentsData]);

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
  const formatAmount = (v: string | number) => (Number(v) / 10 ** dec).toFixed(dec > 6 ? 4 : 2);
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-6 text-center">
          <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatAmount(escrow.balance)}</p>
          <p className="text-[10px] text-muted-foreground">Current Balance</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-lg font-bold tabular-nums text-foreground">{formatAmount(escrow.totalDeposited)}</p>
          <p className="text-[10px] text-muted-foreground">Total Deposited</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-lg font-bold tabular-nums text-foreground">{formatAmount(escrow.totalSettled)}</p>
          <p className="text-[10px] text-muted-foreground">Total Settled</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-lg font-bold tabular-nums text-foreground">{Number(escrow.totalCallsSettled).toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Calls Settled</p>
        </CardContent></Card>
      </div>

      {/* Account Info */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Account Information" />
          <CopyableField label="Escrow PDA" value={escrow.pda} />
          <CopyableField label="Agent" value={agent?.identity?.name ? `${agent.identity.name} (${escrow.agent.slice(0, 8)}…)` : escrow.agent} href={`/address/${escrow.agent}`} />
          <CopyableField label="Agent Wallet" value={escrow.agentWallet} href={`/address/${escrow.agentWallet}`} truncate />
          <CopyableField label="Depositor" value={escrow.depositor} href={`/address/${escrow.depositor}`} truncate />
          {escrow.tokenMint && <CopyableField label="Token Mint" value={escrow.tokenMint} href={`/address/${escrow.tokenMint}`} truncate />}
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
                {escrow.volumeCurve.map((tier: any, i: number) => (
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
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Created</span>
              <TimestampDisplay unixSeconds={escrow.createdAt} />
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Last Settled</span>
              <TimestampDisplay unixSeconds={escrow.lastSettledAt} />
            </div>
            {escrow.expiresAt !== '0' && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Expires</span>
                <TimestampDisplay unixSeconds={escrow.expiresAt} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <OnChainDataSection title="Raw Escrow Account (On-Chain)" data={escrow as unknown as Record<string, unknown>} />
    </DetailPageShell>
  );
}
