'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Copy, ExternalLink, FileCode2, Landmark, Loader2, Search, Shield, Wrench } from 'lucide-react';
import { AgentAvatar, HttpMethodBadge, Skeleton, StatusBadge } from '~/components/ui';
import { AgentTag } from '~/components/ui/agent-tag';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { formatLamports, short, entityPath } from '~/lib/format';
import { cn } from '~/lib/utils';

const SOLSCAN = 'https://solscan.io';

type LookupRecord = Record<string, any>;

type AddressLookupPayload = {
  address: string;
  entityType: string;
  balance: number;
  owner: string | null;
  executable: boolean;
  rentEpoch: number | string | null;
  dataSize: number;
  agent: LookupRecord | null;
  tool: LookupRecord | null;
  escrow: LookupRecord | null;
  attestation: LookupRecord | null;
  feedback: LookupRecord | null;
  vault: LookupRecord | null;
  relatedTools: LookupRecord[];
  relatedEscrows: LookupRecord[];
  relatedAttestations: LookupRecord[];
  relatedFeedbacks: LookupRecord[];
  recentTransactions: Array<{
    signature: string;
    slot: number;
    blockTime: number | null;
    err: unknown;
    memo: string | null;
  }>;
  error?: string;
};

function formatDate(raw: number | null | undefined): string {
  if (!raw) return '—';
  const date = new Date(raw * 1000);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AddressLookupPage() {
  const { address } = useParams<{ address: string }>();
  const router = useRouter();
  const [data, setData] = useState<AddressLookupPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/sap/address/${encodeURIComponent(address)}`)
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error ?? 'Address lookup failed');
        return payload as AddressLookupPayload;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const entityHref = useMemo(() => {
    if (!data) return null;
    if (data.agent?.identity?.wallet) return entityPath('/agents', data.agent.identity.wallet);
    if (data.tool?.pda) return entityPath('/tools', data.tool.pda);
    if (data.escrow?.pda) return entityPath('/escrows', data.escrow.pda);
    if (data.attestation?.pda) return entityPath('/attestations', data.attestation.pda);
    return null;
  }, [data]);

  const copyAddress = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied(null), 1400);
  };

  if (loading) {
    return (
      <div className="space-y-4 motion-safe:animate-fade-in">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Search className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-foreground">Address lookup failed</p>
        <p className="mt-1 text-xs text-muted-foreground">{error ?? 'No response returned'}</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 h-3 w-3" /> Go back
        </Button>
      </div>
    );
  }

  const agentIdentity = data.agent?.identity;
  const relatedCount =
    data.relatedTools.length +
    data.relatedEscrows.length +
    data.relatedAttestations.length +
    data.relatedFeedbacks.length;

  return (
    <div className="space-y-4 motion-safe:animate-fade-in">
      <section className="rounded-lg border border-border/30 bg-card/60 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex min-h-8 items-center gap-1 rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            Back
          </button>
          <span aria-hidden className="text-border">/</span>
          <span>Address</span>
        </div>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {agentIdentity ? (
                <AgentAvatar
                  name={agentIdentity.name}
                  endpoint={agentIdentity.x402Endpoint}
                  size={44}
                  className="rounded-full ring-2 ring-border"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
                  <Landmark className="h-5 w-5" aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {agentIdentity?.name ?? short(data.address, 8, 6)}
                  </h1>
                  <Badge variant="secondary" className="capitalize">{data.entityType}</Badge>
                  {agentIdentity && <StatusBadge active={!!agentIdentity.isActive} size="xs" />}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyAddress(data.address)}
                    className="inline-flex min-h-8 items-center gap-1 rounded px-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {data.address}
                    <Copy className={cn('h-3.5 w-3.5', copied === data.address ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                  </button>
                  <a
                    href={`${SOLSCAN}/account/${data.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-8 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    Solscan
                  </a>
                </div>
              </div>
            </div>
          </div>
          {entityHref && (
            <Button asChild size="sm">
              <Link href={entityHref}>
                Open canonical page <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AddressMetric label="SOL balance" value={formatLamports(data.balance)} />
        <AddressMetric label="Data size" value={`${data.dataSize.toLocaleString()} bytes`} />
        <AddressMetric label="Related SAP objects" value={relatedCount.toLocaleString()} />
        <AddressMetric label="Recent txs" value={data.recentTransactions.length.toLocaleString()} />
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Account Meta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailLine label="Owner" value={data.owner ? <AgentTag address={data.owner} truncate={false} /> : '—'} />
            <DetailLine label="Executable" value={data.executable ? 'Yes' : 'No'} />
            <DetailLine label="Rent epoch" value={data.rentEpoch == null ? '—' : String(data.rentEpoch)} />
            <DetailLine label="Entity type" value={<span className="capitalize">{data.entityType}</span>} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">Matched SAP Entity</CardTitle>
          </CardHeader>
          <CardContent>
            {agentIdentity ? (
              <div className="flex items-center justify-between gap-4 rounded-md border border-border/40 bg-muted/20 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <AgentAvatar name={agentIdentity.name} endpoint={agentIdentity.x402Endpoint} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{agentIdentity.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{agentIdentity.wallet}</p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={entityPath('/agents', agentIdentity.wallet)}>Agent</Link>
                </Button>
              </div>
            ) : data.tool ? (
              <EntityRow
                icon={<Wrench className="h-4 w-4" />}
                title={data.tool.descriptor?.toolName ?? data.tool.toolName ?? 'SAP Tool'}
                subtitle={data.tool.pda}
                href={entityPath('/tools', data.tool.pda)}
                badge={data.tool.descriptor?.httpMethod ? <HttpMethodBadge method={Object.keys(data.tool.descriptor.httpMethod)[0] ?? 'GET'} /> : null}
              />
            ) : data.escrow ? (
              <EntityRow
                icon={<Shield className="h-4 w-4" />}
                title="SAP Escrow"
                subtitle={data.escrow.pda}
                href={entityPath('/escrows', data.escrow.pda)}
              />
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
                <FileCode2 className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-foreground">No canonical SAP entity matched</p>
                <p className="mt-1 text-xs text-muted-foreground">This can still be a wallet, program, token account, or external Solana account.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <RelatedTools tools={data.relatedTools} />
        <RecentTransactions txs={data.recentTransactions} />
      </section>
    </div>
  );
}

function AddressMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-card/60 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 py-2 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-xs text-foreground">{value}</span>
    </div>
  );
}

function EntityRow({
  icon,
  title,
  subtitle,
  href,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-md border border-border/40 bg-muted/20 p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-2">
        {badge}
        <ExternalLink className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </span>
    </Link>
  );
}

function RelatedTools({ tools }: { tools: LookupRecord[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Related Tools</CardTitle>
      </CardHeader>
      <CardContent>
        {tools.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            No tool descriptors reference this address.
          </p>
        ) : (
          <div className="divide-y divide-border/40 rounded-md border border-border/40">
            {tools.slice(0, 8).map((tool) => {
              const descriptor = tool.descriptor ?? tool;
              const method = descriptor.httpMethod && typeof descriptor.httpMethod === 'object'
                ? Object.keys(descriptor.httpMethod)[0] ?? 'GET'
                : String(descriptor.httpMethod ?? 'GET');
              return (
                <Link
                  key={tool.pda}
                  href={entityPath('/tools', tool.pda)}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{descriptor.toolName ?? 'Unnamed tool'}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{tool.pda}</span>
                  </span>
                  <HttpMethodBadge method={method} />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentTransactions({ txs }: { txs: AddressLookupPayload['recentTransactions'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        {txs.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            No recent transaction signatures returned by RPC.
          </p>
        ) : (
          <div className="divide-y divide-border/40 rounded-md border border-border/40">
            {txs.slice(0, 10).map((tx) => (
              <Link
                key={tx.signature}
                href={entityPath('/tx', tx.signature)}
                className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs text-primary">{short(tx.signature, 8, 6)}</span>
                  <span className="block text-xs text-muted-foreground">slot {tx.slot.toLocaleString()} · {formatDate(tx.blockTime)}</span>
                </span>
                <Badge variant={tx.err ? 'destructive' : 'secondary'}>{tx.err ? 'Failed' : 'Success'}</Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
