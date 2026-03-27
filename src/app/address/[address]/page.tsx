'use client';

/* ──────────────────────────────────────────────────────────
 * Address Page — /address/[address]
 *
 * Universal address resolver — identifies what an on-chain
 * address is (agent, tool, escrow, wallet, etc.) and shows
 * all related data: balance, entity info, transactions.
 * ────────────────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Globe,
  Bot,
  Wrench,
  Wallet,
  ShieldCheck,
  MessageSquare,
  Database,
  HardDrive,
  Binary,
} from 'lucide-react';
import {
  Skeleton,
  StatusBadge,
  ScoreRing,
  ProtocolBadge,
  Address as AddressDisplay,
} from '~/components/ui';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import {
  CopyableField,
  TimestampDisplay,
  SolscanLink,
  DIDIdentity,
  OnChainDataSection,
  SectionHeader,
  DetailPageShell,
  FeeDisplay,
} from '~/components/ui/explorer';

/* ── Entity type styling map ──────────────────────────────── */
const ENTITY_LABELS: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; Icon: React.ElementType }
> = {
  agent:       { label: 'SAP Agent',       variant: 'default',   Icon: Bot },
  tool:        { label: 'Tool Descriptor', variant: 'secondary', Icon: Wrench },
  escrow:      { label: 'Escrow Account',  variant: 'outline',   Icon: Wallet },
  attestation: { label: 'Attestation',     variant: 'outline',   Icon: ShieldCheck },
  feedback:    { label: 'Feedback',        variant: 'secondary', Icon: MessageSquare },
  vault:       { label: 'Memory Vault',    variant: 'outline',   Icon: Database },
  wallet:      { label: 'Agent Wallet',    variant: 'default',   Icon: Bot },
  account:     { label: 'Account',         variant: 'outline',   Icon: Globe },
  unknown:     { label: 'Unknown',         variant: 'outline',   Icon: Globe },
};

type AddressData = {
  address: string;
  entityType: string;
  balance: number;
  owner: string | null;
  executable: boolean;
  rentEpoch: number | null;
  dataSize: number;
  agent: any;
  tool: any;
  escrow: any;
  attestation: any;
  feedback: any;
  vault: any;
  relatedTools: any[];
  relatedEscrows: any[];
  relatedAttestations: any[];
  relatedFeedbacks: any[];
  recentTransactions: Array<{
    signature: string;
    slot: number;
    blockTime: number | null;
    err: boolean;
    memo: string | null;
  }>;
};

export default function AddressPage() {
  const { address } = useParams<{ address: string }>();
  const router = useRouter();
  const [data, setData] = useState<AddressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/sap/address/${address}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [address]);

  /* ── Loading State ─────────────────────── */
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-96" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  /* ── Error State ───────────────────────── */
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-destructive">{error ?? 'Address not found'}</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.push('/')}>
          <ArrowLeft className="h-3 w-3 mr-1" /> Home
        </Button>
      </div>
    );
  }

  const entity = ENTITY_LABELS[data.entityType] ?? ENTITY_LABELS.unknown;
  const hasAgent = data.agent?.identity;
  const hasTool = data.tool?.descriptor;
  const totalRelated =
    data.relatedTools.length +
    data.relatedEscrows.length +
    data.relatedAttestations.length +
    data.relatedFeedbacks.length;

  return (
    <DetailPageShell
      backHref="/"
      backLabel="Home"
      title="Address"
      subtitle={`${data.address.slice(0, 16)}…${data.address.slice(-8)}`}
      onBack={() => router.back()}
      badges={<Badge variant={entity.variant}><entity.Icon className="h-3 w-3 mr-1" />{entity.label}</Badge>}
      icon={
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <entity.Icon className="h-5 w-5 text-primary" />
        </div>
      }
    >
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {hasAgent && <TabsTrigger value="agent">Agent Data</TabsTrigger>}
          {hasTool && <TabsTrigger value="tool">Tool Data</TabsTrigger>}
          {totalRelated > 0 && <TabsTrigger value="related">Related ({totalRelated})</TabsTrigger>}
          <TabsTrigger value="transactions">Transactions ({data.recentTransactions.length})</TabsTrigger>
        </TabsList>

        {/* ── Tab: Overview ────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {(data.balance / 1e9).toFixed(6)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">SOL Balance</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4 flex items-start gap-3">
                <HardDrive className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                <div>
                  <p className="text-2xl font-bold tabular-nums">{data.dataSize.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Data Size (bytes)</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4 flex items-start gap-3">
                <Binary className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                <div>
                  <p className="text-2xl font-bold tabular-nums">{data.executable ? 'Yes' : 'No'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Executable</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Account Information */}
          <Card>
            <CardContent className="pt-6">
              <SectionHeader title="Account Information" />
              <CopyableField label="Address" value={data.address} />
              <CopyableField label="Entity Type" value={entity.label} mono={false} />
              {data.owner && (
                <CopyableField label="Owner Program" value={data.owner} href={`/address/${data.owner}`} truncate />
              )}
              <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/50">
                <span className="text-xs text-muted-foreground shrink-0 min-w-[120px]">Balance</span>
                <FeeDisplay lamports={data.balance} />
              </div>
              <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/50">
                <span className="text-xs text-muted-foreground shrink-0 min-w-[120px]">Solscan</span>
                <SolscanLink type="account" value={data.address} label="View on Solscan →" />
              </div>
            </CardContent>
          </Card>

          {/* DID if agent */}
          {hasAgent && (
            <DIDIdentity
              agentId={data.agent.identity.agentId}
              agentUri={data.agent.identity.agentUri}
              wallet={data.agent.identity.wallet}
            />
          )}

          {/* Quick entity summaries */}
          {data.escrow && (
            <Card>
              <CardContent className="pt-6">
                <SectionHeader title="Escrow Data" />
                <CopyableField label="Balance" value={`${Number(data.escrow.balance) / 1e9} SOL`} mono={false} />
                <CopyableField label="Agent" value={data.escrow.agent ?? ''} href={data.escrow.agent ? `/address/${data.escrow.agent}` : undefined} truncate />
                <CopyableField label="Depositor" value={data.escrow.depositor ?? ''} href={data.escrow.depositor ? `/address/${data.escrow.depositor}` : undefined} truncate />
                <Link href={`/escrows/${data.address}`} className="text-xs text-primary hover:underline mt-3 block">
                  View full escrow details →
                </Link>
              </CardContent>
            </Card>
          )}

          {data.attestation && (
            <Card>
              <CardContent className="pt-6">
                <SectionHeader title="Attestation Data" />
                <CopyableField label="Type" value={data.attestation.attestationType ?? ''} mono={false} />
                <CopyableField label="Agent" value={data.attestation.agent ?? ''} href={data.attestation.agent ? `/address/${data.attestation.agent}` : undefined} truncate />
                <CopyableField label="Attester" value={data.attestation.attester ?? ''} href={data.attestation.attester ? `/address/${data.attestation.attester}` : undefined} truncate />
                <Link href={`/attestations/${data.address}`} className="text-xs text-primary hover:underline mt-3 block">
                  View full attestation details →
                </Link>
              </CardContent>
            </Card>
          )}

          {data.feedback && (
            <Card>
              <CardContent className="pt-6">
                <SectionHeader title="Feedback Data" />
                <CopyableField label="Score" value={String(data.feedback.score ?? 0)} mono={false} />
                <CopyableField label="Tag" value={data.feedback.tag ?? ''} mono={false} />
                <CopyableField label="Reviewer" value={data.feedback.reviewer ?? ''} href={data.feedback.reviewer ? `/address/${data.feedback.reviewer}` : undefined} truncate />
              </CardContent>
            </Card>
          )}

          {data.vault && (
            <Card>
              <CardContent className="pt-6">
                <SectionHeader title="Memory Vault" />
                <CopyableField label="Sessions" value={String(data.vault.totalSessions ?? 0)} mono={false} />
                <CopyableField label="Inscriptions" value={String(data.vault.totalInscriptions ?? 0)} mono={false} />
                <CopyableField label="Bytes" value={String(data.vault.totalBytesInscribed ?? 0)} mono={false} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab: Agent Data ──────────────────── */}
        {hasAgent && (
          <TabsContent value="agent" className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <SectionHeader title="Agent Identity" />
                <div className="flex items-center gap-3 mb-4">
                  <ScoreRing score={data.agent.identity.reputationScore} size={56} />
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-semibold">{data.agent.identity.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{data.agent.identity.description}</p>
                  </div>
                  <StatusBadge active={data.agent.identity.isActive} />
                </div>
                <CopyableField label="Agent PDA" value={data.agent.pda} />
                <CopyableField label="Wallet" value={data.agent.identity.wallet} href={`/agents/${data.agent.identity.wallet}`} truncate />
                <CopyableField label="Reputation" value={`${data.agent.identity.reputationScore} / 1000`} mono={false} />
                <CopyableField label="Total Calls" value={Number(data.agent.identity.totalCallsServed).toLocaleString()} mono={false} />
                <CopyableField label="Avg Latency" value={`${data.agent.identity.avgLatencyMs}ms`} mono={false} />
                <CopyableField label="Uptime" value={`${data.agent.identity.uptimePercent}%`} mono={false} />
                <CopyableField label="Feedbacks" value={String(data.agent.identity.totalFeedbacks)} mono={false} />
                <CopyableField label="Version" value={String(data.agent.identity.version)} mono={false} />
                <div className="space-y-2 mt-4">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Created</span>
                    <TimestampDisplay unixSeconds={data.agent.identity.createdAt} />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Updated</span>
                    <TimestampDisplay unixSeconds={data.agent.identity.updatedAt} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <DIDIdentity
              agentId={data.agent.identity.agentId}
              agentUri={data.agent.identity.agentUri}
              wallet={data.agent.identity.wallet}
            />

            {/* Protocols */}
            {data.agent.identity.protocols?.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <SectionHeader title="Protocols" count={data.agent.identity.protocols.length} />
                  <div className="flex flex-wrap gap-2">
                    {data.agent.identity.protocols.map((p: string) => (
                      <Link key={p} href={`/protocols/${encodeURIComponent(p)}`}>
                        <ProtocolBadge protocol={p} />
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Capabilities */}
            {data.agent.identity.capabilities?.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <SectionHeader title="Capabilities" count={data.agent.identity.capabilities.length} />
                  <div className="space-y-1">
                    {data.agent.identity.capabilities.map((c: any) => (
                      <Link
                        key={c.id}
                        href={`/capabilities/${encodeURIComponent(c.id)}`}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <span className="font-mono text-xs">{c.id}</span>
                        {c.protocolId && <ProtocolBadge protocol={c.protocolId} />}
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <OnChainDataSection
              title="Raw Agent Account (On-Chain)"
              data={data.agent as Record<string, unknown>}
            />
          </TabsContent>
        )}

        {/* ── Tab: Tool Data ───────────────────── */}
        {hasTool && (
          <TabsContent value="tool" className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <SectionHeader title="Tool Descriptor" />
                <CopyableField label="Tool Name" value={data.tool.descriptor.toolName} mono={false} />
                <CopyableField label="Tool PDA" value={data.tool.pda} />
                <CopyableField
                  label="Agent"
                  value={data.tool.descriptor.agent}
                  href={`/address/${data.tool.descriptor.agent}`}
                  truncate
                />
                <CopyableField
                  label="Category"
                  value={typeof data.tool.descriptor.category === 'object' ? Object.keys(data.tool.descriptor.category)[0] : String(data.tool.descriptor.category)}
                  mono={false}
                />
                <CopyableField
                  label="HTTP Method"
                  value={typeof data.tool.descriptor.httpMethod === 'object' ? Object.keys(data.tool.descriptor.httpMethod)[0] : String(data.tool.descriptor.httpMethod)}
                  mono={false}
                />
                <CopyableField label="Invocations" value={Number(data.tool.descriptor.totalInvocations).toLocaleString()} mono={false} />
                <CopyableField
                  label="Params"
                  value={`${data.tool.descriptor.requiredParams} required / ${data.tool.descriptor.paramsCount} total`}
                  mono={false}
                />
              </CardContent>
            </Card>

            <OnChainDataSection
              title="Raw Tool Descriptor (On-Chain)"
              data={data.tool as Record<string, unknown>}
            />
          </TabsContent>
        )}

        {/* ── Tab: Related Entities ────────────── */}
        {totalRelated > 0 && (
          <TabsContent value="related" className="space-y-6">
            {data.relatedTools.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <SectionHeader title="Related Tools" count={data.relatedTools.length} />
                  <div className="space-y-1">
                    {data.relatedTools.map((t: any) => (
                      <Link
                        key={t.pda}
                        href={`/tools/${t.pda}`}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <Wrench className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400 shrink-0" />
                        <span className="text-xs font-medium truncate">{t.descriptor?.toolName ?? t.pda.slice(0, 12)}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                          {t.descriptor?.totalInvocations ?? 0} invocations
                        </span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {data.relatedEscrows.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <SectionHeader title="Related Escrows" count={data.relatedEscrows.length} />
                  <div className="space-y-1">
                    {data.relatedEscrows.map((e: any) => (
                      <Link
                        key={e.pda}
                        href={`/escrows/${e.pda}`}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <AddressDisplay value={e.pda} />
                        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                          {Number(e.account?.balance ?? 0) / 1e9} SOL
                        </span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {data.relatedAttestations.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <SectionHeader title="Related Attestations" count={data.relatedAttestations.length} />
                  <div className="space-y-1">
                    {data.relatedAttestations.map((a: any) => (
                      <Link
                        key={a.pda}
                        href={`/attestations/${a.pda}`}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                        <AddressDisplay value={a.pda} />
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          {a.account?.attestationType ?? 'attestation'}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {data.relatedFeedbacks.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <SectionHeader title="Related Feedbacks" count={data.relatedFeedbacks.length} />
                  <div className="space-y-1">
                    {data.relatedFeedbacks.map((f: any) => (
                      <Link
                        key={f.pda}
                        href={`/address/${f.pda}`}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <AddressDisplay value={f.pda} />
                        <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 tabular-nums">
                          Score: {f.account?.score ?? '—'}
                        </span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {/* ── Tab: Transactions ────────────────── */}
        <TabsContent value="transactions" className="space-y-4">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <SectionHeader title="Recent Transactions" count={data.recentTransactions.length} className="px-5 pt-5 pb-2" />
              {data.recentTransactions.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">No recent transactions</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Signature</TableHead>
                      <TableHead>Slot</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentTransactions.map((tx) => (
                      <TableRow key={tx.signature} className="cursor-pointer" onClick={() => router.push(`/tx/${tx.signature}`)}>
                        <TableCell>
                          <span className="font-mono text-xs text-primary truncate block max-w-[260px]">
                            {tx.signature.slice(0, 20)}…{tx.signature.slice(-8)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            {tx.slot.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <TimestampDisplay unixSeconds={tx.blockTime} compact />
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={tx.err ? 'destructive' : 'default'} className={!tx.err ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}>
                            {tx.err ? 'Failed' : 'Success'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DetailPageShell>
  );
}
