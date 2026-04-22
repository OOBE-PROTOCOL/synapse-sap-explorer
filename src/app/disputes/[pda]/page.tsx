'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Swords,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Timer,
  ShieldCheck,
  Users,
  ArrowLeft,
  Receipt,
  Lock,
  Database,
  FileCheck,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  Skeleton,
  Address,
  ExplorerPageShell,
} from '~/components/ui';
import { DataSourceBadge } from '~/components/ui/explorer-primitives';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useDisputes, useReceiptBatches, useEscrow } from '~/hooks/use-sap';
import { AgentTag } from '~/components/ui/agent-tag';
import { formatLamports } from '~/lib/format';

/* ── Config ─────────────────────────────────── */

const TIMELINE_STEPS = [
  {
    id: 'filed',
    label: 'Dispute Filed',
    icon: Swords,
    description: 'Disputant submits claim with bond deposit',
  },
  {
    id: 'proof',
    label: 'Proof Window',
    icon: FileCheck,
    description: 'Agent must submit receipt proof within deadline',
  },
  {
    id: 'auto',
    label: 'Auto-Resolution',
    icon: ShieldCheck,
    description: 'On-chain Merkle proof verification (Layer 1)',
  },
  {
    id: 'governance',
    label: 'Governance',
    icon: Users,
    description: 'DAO/arbiter review if auto-resolution fails (Layer 2)',
  },
  {
    id: 'resolved',
    label: 'Resolved',
    icon: CheckCircle2,
    description: 'Final outcome — funds distributed',
  },
];

/* ── Page ────────────────────────────────────── */

export default function DisputeDetailPage() {
  const params = useParams();
  const pda = params.pda as string;
  const { data: disputeData, loading } = useDisputes();

  const dispute = useMemo(() => {
    if (!disputeData?.disputes) return null;
    return disputeData.disputes.find((d) => d.pda === pda) ?? null;
  }, [disputeData, pda]);

  const { data: escrowData } = useEscrow(dispute?.escrowPda ?? null);
  const { data: receiptData } = useReceiptBatches(dispute?.escrowPda);

  /* Derive timeline progress */
  const activeStep = useMemo(() => {
    if (!dispute) return 0;
    if (dispute.outcome !== 'Pending') return 4; // resolved
    if (dispute.resolutionLayer === 'Governance') return 3;
    if (dispute.resolutionLayer === 'Auto') return 2;
    if (dispute.proofDeadline) return 1;
    return 0;
  }, [dispute]);

  if (loading && !disputeData) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <Swords className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Dispute not found</h2>
        <p className="text-sm text-muted-foreground">PDA: {pda}</p>
        <Link href="/disputes">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Disputes
          </Button>
        </Link>
      </div>
    );
  }

  const escrow = escrowData?.escrow ?? null;
  const receipts = receiptData?.receipts ?? [];

  return (
    <ExplorerPageShell
      title="Dispute Arbitration"
      subtitle={`3-layer resolution timeline for dispute ${pda.slice(0, 8)}…`}
      icon={<Scale className="h-5 w-5" />}
      actions={
        <Link href="/disputes">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Disputes
          </Button>
        </Link>
      }
    >
      {/* ── Key info cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="arena-panel">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
              <Swords className="h-3 w-3" />
              Dispute Type
            </div>
            <p className="text-sm font-semibold">{dispute.disputeType.replace(/([A-Z])/g, ' $1').trim()}</p>
            <DataSourceBadge source="onchain" />
          </CardContent>
        </Card>
        <Card className="arena-panel">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
              <Scale className="h-3 w-3" />
              Outcome
            </div>
            <Badge variant={
              dispute.outcome === 'Upheld' ? 'neon-emerald' :
              dispute.outcome === 'Rejected' ? 'neon-rose' :
              dispute.outcome === 'Pending' ? 'neon-amber' :
              'neon-orange'
            }>
              {dispute.outcome}
            </Badge>
          </CardContent>
        </Card>
        <Card className="arena-panel">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
              <Lock className="h-3 w-3" />
              Bond
            </div>
            <p className="text-sm font-bold font-mono">{formatLamports(dispute.disputeBond)}</p>
          </CardContent>
        </Card>
        <Card className="arena-panel">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
              <Receipt className="h-3 w-3" />
              Calls
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono">
                {dispute.provenCalls ?? '—'} / {dispute.claimedCalls ?? '—'}
              </span>
              <span className="text-[10px] text-muted-foreground">proven/claimed</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Resolution Timeline ── */}
      <Card className="arena-panel mb-8">
        <CardHeader>
          <CardTitle className="gradient-text text-base">Resolution Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {TIMELINE_STEPS.map((step, i) => {
              const StepIcon = step.icon;
              const isActive = i <= activeStep;
              const isCurrent = i === activeStep;

              return (
                <div key={step.id} className="flex gap-4 mb-6 last:mb-0">
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full ring-2 transition-all duration-500',
                      isCurrent ? 'ring-primary bg-primary/20 shadow-[0_0_12px_hsl(var(--glow)/0.4)]' :
                      isActive ? 'ring-emerald-500/40 bg-emerald-500/10' :
                      'ring-border/30 bg-muted/10',
                    )}>
                      <StepIcon className={cn(
                        'h-4 w-4 transition-colors',
                        isCurrent ? 'text-primary' :
                        isActive ? 'text-emerald-400' :
                        'text-muted-foreground/30',
                      )} />
                    </div>
                    {i < TIMELINE_STEPS.length - 1 && (
                      <div className={cn(
                        'w-px flex-1 min-h-[24px] transition-colors',
                        isActive ? 'bg-gradient-to-b from-emerald-500/40 to-emerald-500/10' : 'bg-border/20',
                      )} />
                    )}
                  </div>

                  {/* Content */}
                  <div className={cn('pb-4', !isActive && 'opacity-40')}>
                    <p className={cn(
                      'text-sm font-semibold',
                      isCurrent && 'text-primary',
                    )}>
                      {step.label}
                      {isCurrent && (
                        <Badge variant="outline" className="ml-2 text-[9px] animate-pulse">
                          Current
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {step.description}
                    </p>

                    {/* Step-specific data */}
                    {step.id === 'filed' && (
                      <div className="mt-2 text-xs space-y-1">
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Disputant:</span>
                          <Address value={dispute.disputant} className="text-xs" copy />
                        </div>
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Filed:</span>
                          <span>{new Date(dispute.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    )}

                    {step.id === 'proof' && dispute.proofDeadline && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <Timer className={cn(
                          'h-3.5 w-3.5',
                          new Date(dispute.proofDeadline) < new Date() ? 'text-red-400' : 'text-amber-400',
                        )} />
                        <span>Deadline: {new Date(dispute.proofDeadline).toLocaleString()}</span>
                        {new Date(dispute.proofDeadline) < new Date() && (
                          <Badge variant="neon-rose" className="text-[9px]">Expired</Badge>
                        )}
                      </div>
                    )}

                    {step.id === 'auto' && dispute.provenCalls != null && (
                      <div className="mt-2 text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <Database className="h-3 w-3 text-muted-foreground" />
                          <span>Merkle proof verification: {dispute.provenCalls} calls proven on-chain</span>
                        </div>
                        {receipts.length > 0 && (
                          <span className="text-emerald-400">{receipts.length} receipt batch(es) found</span>
                        )}
                      </div>
                    )}

                    {step.id === 'resolved' && dispute.resolvedAt && (
                      <div className="mt-2 text-xs">
                        <span className="text-muted-foreground">Resolved: </span>
                        <span>{new Date(dispute.resolvedAt).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Entities panel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Agent info */}
        <Card className="arena-panel">
          <CardHeader>
            <CardTitle className="text-sm">Agent</CardTitle>
          </CardHeader>
          <CardContent>
            <AgentTag
              address={dispute.agentPda}
            />
            <div className="mt-2">
              <Address value={dispute.agentPda} className="text-xs" copy />
            </div>
            <DataSourceBadge source="onchain" />
          </CardContent>
        </Card>

        {/* Escrow info */}
        <Card className="arena-panel">
          <CardHeader>
            <CardTitle className="text-sm">Linked Escrow</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href={`/escrows/${dispute.escrowPda}`} className="text-primary hover:underline text-sm">
              <Address value={dispute.escrowPda} className="text-xs" copy />
            </Link>
            {escrow && (
              <div className="mt-2 text-xs space-y-1">
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Balance:</span>
                  <span className="font-mono">{formatLamports(String(escrow.balance))}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Calls Settled:</span>
                  <span className="font-mono">{escrow.totalCallsSettled}</span>
                </div>
              </div>
            )}
            <DataSourceBadge source="onchain" />
          </CardContent>
        </Card>
      </div>

      {/* ── Reason ── */}
      {dispute.reason && (
        <Card className="arena-panel mt-4">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Dispute Reason
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground italic">&ldquo;{dispute.reason}&rdquo;</p>
          </CardContent>
        </Card>
      )}

      {/* ── TX reference ── */}
      {dispute.txSignature && (
        <div className="mt-4 text-xs text-muted-foreground flex items-center gap-2">
          <span>TX:</span>
          <a
            href={`https://solscan.io/tx/${dispute.txSignature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-primary hover:underline"
          >
            {dispute.txSignature.slice(0, 16)}…
          </a>
          <DataSourceBadge source="onchain" />
        </div>
      )}
    </ExplorerPageShell>
  );
}
