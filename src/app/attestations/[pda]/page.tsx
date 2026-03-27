'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Skeleton, StatusBadge } from '~/components/ui';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  CopyableField,
  TimestampDisplay,
  SolscanLink,
  DIDIdentity,
  OnChainDataSection,
  SectionHeader,
  DetailPageShell,
} from '~/components/ui/explorer';
import { useAttestations, useAgents } from '~/hooks/use-sap';

export default function AttestationDetailPage() {
  const { pda } = useParams<{ pda: string }>();
  const router = useRouter();
  const { data, loading: attLoading } = useAttestations();
  const { data: agentsData, loading: aLoading } = useAgents({ limit: '100' });
  const loading = attLoading || aLoading;

  const attestation = useMemo(() => {
    if (!data?.attestations) return null;
    return data.attestations.find((a) => a.pda === pda) ?? null;
  }, [data, pda]);

  const agent = useMemo(() => {
    if (!attestation || !agentsData?.agents) return null;
    return agentsData.agents.find((a) => a.pda === attestation.agent) ?? null;
  }, [attestation, agentsData]);

  const attesterAgent = useMemo(() => {
    if (!attestation || !agentsData?.agents) return null;
    return agentsData.agents.find((a) =>
      a.pda === attestation.attester || a.identity?.wallet === attestation.attester
    ) ?? null;
  }, [attestation, agentsData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!attestation) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Attestation not found: {pda}</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.push('/attestations')}>
          <ArrowLeft className="h-3 w-3 mr-1" /> All Attestations
        </Button>
      </div>
    );
  }

  const isExpired = attestation.expiresAt !== '0' && Number(attestation.expiresAt) * 1000 < Date.now();

  return (
    <DetailPageShell
      backHref="/attestations"
      backLabel="All Attestations"
      title="Attestation"
      subtitle={`Web-of-Trust attestation · ${attestation.attestationType}`}
      onBack={() => router.push('/attestations')}
      badges={
        <>
          <Badge variant="outline">{attestation.attestationType}</Badge>
          {isExpired ? (
            <Badge variant="destructive">Expired</Badge>
          ) : (
            <StatusBadge active={attestation.isActive} />
          )}
        </>
      }
      icon={
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
      }
    >
      {/* Overview */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Attestation Information" />
          <CopyableField label="Attestation PDA" value={attestation.pda} />
          <CopyableField label="Type" value={attestation.attestationType} mono={false} />
          <CopyableField label="Status" value={isExpired ? 'Expired' : attestation.isActive ? 'Active' : 'Inactive'} mono={false} />
          {attestation.metadataHash && attestation.metadataHash !== '0' && (
            <CopyableField label="Metadata Hash" value={attestation.metadataHash} />
          )}
          <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/50">
            <span className="text-xs text-muted-foreground shrink-0 min-w-[120px]">Solscan</span>
            <SolscanLink type="account" value={attestation.pda} label="View on Solscan →" />
          </div>
        </CardContent>
      </Card>

      {/* Subject Agent */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Subject Agent" />
          <CopyableField label="Agent PDA" value={attestation.agent} href={`/address/${attestation.agent}`} truncate />
          {agent?.identity && (
            <>
              <CopyableField label="Agent Name" value={agent.identity.name} mono={false} />
              <CopyableField label="Agent Wallet" value={agent.identity.wallet} href={`/agents/${agent.identity.wallet}`} truncate />
            </>
          )}
          <DIDIdentity
            agentId={agent?.identity?.agentId}
            agentUri={agent?.identity?.agentUri}
            wallet={agent?.identity?.wallet}
            className="mt-3"
          />
        </CardContent>
      </Card>

      {/* Attester */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Attester" />
          <CopyableField label="Attester Address" value={attestation.attester} href={`/address/${attestation.attester}`} truncate />
          {attesterAgent?.identity && (
            <>
              <CopyableField label="Attester Name" value={attesterAgent.identity.name} mono={false} />
              <DIDIdentity
                agentId={attesterAgent.identity.agentId}
                agentUri={attesterAgent.identity.agentUri}
                wallet={attesterAgent.identity.wallet}
                className="mt-3"
              />
            </>
          )}
          {!attesterAgent && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
              Not a registered SAP agent
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timestamps */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader title="Timestamps" />
          <div className="space-y-3">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Created</span>
              <TimestampDisplay unixSeconds={attestation.createdAt} />
            </div>
            {attestation.expiresAt !== '0' && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                  {isExpired ? 'Expired At' : 'Expires At'}
                </span>
                <TimestampDisplay unixSeconds={attestation.expiresAt} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <OnChainDataSection title="Raw Attestation (On-Chain)" data={attestation as unknown as Record<string, unknown>} />
    </DetailPageShell>
  );
}
