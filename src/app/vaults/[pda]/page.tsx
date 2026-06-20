'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Vault, Database, FileText, Clock,
  Layers, Terminal, Copy, Check, ExternalLink, HardDrive,
  Hash, ShieldCheck, ArrowRight, ChevronDown,
} from 'lucide-react';
import { ExplorerPageShell, EmptyState } from '~/components/ui';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { Button } from '~/components/ui/button';
import {
  useInscriptions,
  useVaultDetail,
  type ParsedInscription,
  type ParsedLedgerEntry,
  type VaultDetailEvent,
} from '~/hooks/use-sap-vaults';
import { asText, entityPath, short, timeAgo, fmtNum } from '~/lib/format';
import { cn } from '~/lib/utils';

export default function VaultDetailPage() {
  const params = useParams();
  const router = useRouter();
  const vaultPda = params.pda as string;
  const { data, loading, error } = useVaultDetail(vaultPda);
  const inscriptionLimit = Math.min(
    Math.max(Number(data?.totalInscriptions ?? 3000), 3000),
    5000,
  );
  const {
    data: inscriptionData,
    loading: inscriptionsLoading,
    error: inscriptionsError,
  } = useInscriptions(vaultPda, undefined, { limit: inscriptionLimit, rpc: false });

  const vault = data;

  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const estimateFees = (bytes: number): string => {
    // ~0.000001 SOL per KB (Solana storage fee estimate)
    const sol = (bytes / 1024) * 0.000001;
    return sol.toFixed(6);
  };

  if (loading) {
    return (
      <ExplorerPageShell
        title="Vault Details"
        subtitle="Loading vault information..."
        icon={<Vault className="h-5 w-5" />}
      >
        <Card>
          <CardContent className="p-4 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </ExplorerPageShell>
    );
  }

  if (error || !vault) {
    return (
      <ExplorerPageShell
        title="Vault Not Found"
        subtitle="The requested vault could not be found"
        icon={<Vault className="h-5 w-5" />}
      >
        <EmptyState message={error ?? 'Vault not found'} />
      </ExplorerPageShell>
    );
  }

  const vaultPdaFull = asText(vault.pda);
  const wallet = asText(vault.wallet);
  const totalBytes = vault.totalBytesInscribed;
  const estFees = estimateFees(totalBytes);

  return (
    <ExplorerPageShell
      title="Vault Details"
      subtitle={`Vault ${short(vaultPdaFull, 8, 8)}`}
      icon={<Vault className="h-5 w-5" />}
      badge={
        <Badge variant="outline" className="text-xs">
          {vault.sessions.length} sessions
        </Badge>
      }
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          className="gap-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Header Info */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <Vault className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Vault Overview
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Vault PDA</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs font-mono text-primary bg-primary/5 px-2 py-1 rounded">
                        {short(vaultPdaFull, 16, 8)}
                      </code>
                      <button
                        onClick={() => copyToClipboard(vaultPdaFull)}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        aria-label="Copy vault PDA"
                      >
                        {copied === vaultPdaFull ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </button>
                      <Link
                        href={`https://solscan.io/account/${vaultPdaFull}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 hover:bg-muted rounded transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </Link>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Agent Wallet</p>
                    <Link
                      href={entityPath('/agents', wallet)}
                      className="flex items-center gap-2 mt-1 hover:text-primary transition-colors"
                    >
                      <code className="text-xs font-mono text-primary bg-primary/5 px-2 py-1 rounded">
                        {short(wallet, 16, 8)}
                      </code>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Sessions</span>
                </div>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {vault.totalSessions}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  <span>Inscriptions</span>
                </div>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {fmtNum(Number(vault.totalInscriptions))}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Database className="h-3.5 w-3.5" />
                  <span>Data Size</span>
                </div>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {formatBytes(totalBytes)}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <HardDrive className="h-3.5 w-3.5" />
                  <span>Est. Fees</span>
                </div>
                <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {estFees} SOL
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sessions Tree */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">
                Sessions & Inscriptions
              </h3>
              <Badge variant="outline" className="ml-auto">
                {vault.sessions?.length ?? 0} sessions
              </Badge>
            </div>

            {vault.sessions && vault.sessions.length > 0 ? (
              <div className="space-y-2">
                {vault.sessions.map((session, idx) => {
                  const isOpen = !session.isClosed;
                  return (
                    <div
                      key={`${session.pda || idx}`}
                      className={cn(
                        'rounded-lg border p-4 transition-colors',
                        isOpen
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : 'border-border bg-card'
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-lg',
                              isOpen
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            <Terminal className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              Session {idx + 1}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {isOpen ? 'Active' : 'Closed'} •{' '}
                              {fmtNum(session.sequenceCounter)} writes
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-mono text-muted-foreground">
                            {timeAgo(
                              Number(session.createdAt) *
                                (Number(session.createdAt) > 1e12 ? 1 : 1000)
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Session stats */}
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div className="text-xs">
                          <span className="text-muted-foreground">Total Bytes:</span>{' '}
                          <span className="font-mono">{formatBytes(session.totalBytes)}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground">Current Epoch:</span>{' '}
                          <span className="font-mono">{session.currentEpoch}</span>
                        </div>
                      </div>

                      {/* Ledger Inscriptions */}
                      {session.ledger && session.ledger.ringEntries && session.ledger.ringEntries.length > 0 && (
                        <div className="mt-4">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            <h5 className="text-xs font-semibold text-foreground">
                              Ledger Inscriptions ({session.ledger.ringEntries.length})
                            </h5>
                          </div>
                          <div className="space-y-1 max-h-64 overflow-y-auto">
                            {session.ledger.ringEntries.slice(0, 20).map((insc, i) => {
                              const fee = estimateFees(insc.size);
                              return (
                                <div
                                  key={i}
                                  className="flex items-center justify-between text-xs p-2 rounded bg-muted/30"
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="font-mono text-primary shrink-0">#{insc.index + 1}</span>
                                    {insc.text ? (
                                      <code className="bg-background px-2 py-0.5 rounded truncate text-muted-foreground">
                                        {short(insc.text, 40, 8)}
                                      </code>
                                    ) : (
                                      <code className="bg-background px-2 py-0.5 rounded truncate text-muted-foreground">
                                        {short(insc.data, 24, 8)}
                                      </code>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-muted-foreground">{formatBytes(insc.size)}</span>
                                    <span className="font-mono text-emerald-600 dark:text-emerald-400">{fee} SOL</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {session.ledger.ringEntries.length > 20 && (
                            <p className="text-xs text-muted-foreground text-center mt-2">
                              +{session.ledger.ringEntries.length - 20} more inscriptions
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState message="No sessions found for this vault" />
            )}
          </CardContent>
        </Card>

        <VaultTransactionsSection
          events={vault.events ?? []}
          inscriptions={inscriptionData?.inscriptions ?? []}
          ledgerEntries={inscriptionData?.ledgerEntries ?? []}
          totalWrites={vault.totalInscriptions}
          loading={inscriptionsLoading}
          error={inscriptionsError}
          copied={copied}
          onCopy={copyToClipboard}
        />
      </div>
    </ExplorerPageShell>
  );
}

function VaultTransactionsSection({
  events,
  inscriptions,
  ledgerEntries,
  totalWrites,
  loading,
  error,
  copied,
  onCopy,
}: {
  events: VaultDetailEvent[];
  inscriptions: ParsedInscription[];
  ledgerEntries: ParsedLedgerEntry[];
  totalWrites: number;
  loading: boolean;
  error: string | null;
  copied: string | null;
  onCopy: (value: string) => void;
}) {
  const dedupedEvents = dedupeVaultEvents(events);
  const dedupedInscriptions = dedupeParsedInscriptions(inscriptions);
  const dedupedLedgerEntries = dedupeParsedLedgerEntries(ledgerEntries);
  const inscriptionsByEventKey = new Map<string, ParsedInscription>();
  const fragmentsBySignature = groupFragmentsBySignature(dedupedInscriptions);
  for (const inscription of dedupedInscriptions) {
    inscriptionsByEventKey.set(memoryEventKey(inscription.txSignature, inscription.sequence, inscription.fragmentIndex), inscription);
  }

  const txCount = new Set([
    ...dedupedEvents.map((event) => event.txSignature).filter(Boolean),
    ...dedupedInscriptions.map((item) => item.txSignature).filter(Boolean),
    ...dedupedLedgerEntries.map((item) => item.txSignature).filter(Boolean),
  ]).size;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-base font-semibold text-foreground">Transactions & Inscriptions</h3>
              <p className="text-xs text-muted-foreground">
                SAP memory events and transaction previews for this vault.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span><span className="font-mono text-foreground">{txCount}</span> tx</span>
            <span>
              <span className="font-mono text-foreground">{dedupedInscriptions.length}</span>
              {totalWrites > dedupedInscriptions.length ? (
                <> / <span className="font-mono text-foreground">{fmtNum(totalWrites)}</span> writes</>
              ) : ' inscriptions'}
            </span>
            <span><span className="font-mono text-foreground">{dedupedLedgerEntries.length}</span> ledger entries</span>
          </div>
        </div>

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-500">
            Could not reconstruct inscription logs right now: {error}
          </div>
        )}

        {!loading && !error && txCount === 0 && (
          <EmptyState message="No vault transaction logs indexed yet" />
        )}

        {!loading && !error && txCount > 0 && (
          <div className="space-y-4">
            {dedupedEvents.length > 0 && (
              <TransactionGroup title="Indexed Vault Events" count={dedupedEvents.length}>
                {dedupedEvents.slice(0, 50).map((event) => (
                  <IndexedVaultEventCard
                    key={`${event.id}:${event.txSignature}`}
                    event={event}
                    inscription={inscriptionsByEventKey.get(memoryEventKey(
                      event.txSignature,
                      Number(valueText(event.data?.sequence) || 0),
                      Number(valueText(event.data?.fragmentIndex ?? event.data?.fragment_index) || 0),
                    )) ?? null}
                    fragments={fragmentsBySignature.get(event.txSignature) ?? []}
                    copied={copied}
                    onCopy={onCopy}
                  />
                ))}
              </TransactionGroup>
            )}
            {dedupedInscriptions.length > 0 && (
              <TransactionGroup title="Memory Inscriptions" count={dedupedInscriptions.length}>
                {dedupedInscriptions.slice(0, 50).map((item) => (
                  <TxRow
                    key={`${item.txSignature}:${item.sequence}:${item.fragmentIndex}`}
                    signature={item.txSignature}
                    slot={item.slot}
                    blockTime={item.blockTime}
                    title={`Sequence #${item.sequence} · fragment ${item.fragmentIndex + 1}/${item.totalFragments}`}
                    subtitle={`epoch ${item.epochIndex} · ${item.dataLen} bytes · nonce v${item.nonceVersion}`}
                    payload={item}
                    fragments={fragmentsBySignature.get(item.txSignature) ?? [item]}
                    copied={copied}
                    onCopy={onCopy}
                  />
                ))}
              </TransactionGroup>
            )}
            {dedupedLedgerEntries.length > 0 && (
              <TransactionGroup title="Ledger Entries" count={dedupedLedgerEntries.length}>
                {dedupedLedgerEntries.slice(0, 50).map((item) => (
                  <TxRow
                    key={`${item.txSignature}:${item.entryIndex}`}
                    signature={item.txSignature}
                    slot={item.slot}
                    blockTime={item.blockTime}
                    title={`Ledger entry #${item.entryIndex + 1}`}
                    subtitle={`${item.dataLen} bytes · root ${short(item.merkleRoot, 8, 8)}`}
                    payload={item}
                    copied={copied}
                    onCopy={onCopy}
                  />
                ))}
              </TransactionGroup>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TransactionGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function IndexedVaultEventCard({
  event,
  inscription,
  fragments,
  copied,
  onCopy,
}: {
  event: VaultDetailEvent;
  inscription: ParsedInscription | null;
  fragments: ParsedInscription[];
  copied: string | null;
  onCopy: (value: string) => void;
}) {
  const [reconstructOpen, setReconstructOpen] = useState(false);
  const data = event.data ?? {};
  const instruction = event.name.replace(/Event$/i, '');
  const sequence = valueText(data.sequence);
  const epochIndex = valueText(data.epochIndex ?? data.epoch_index);
  const dataLen = valueText(data.dataLen ?? data.data_len);
  const fragmentIndex = valueText(data.fragmentIndex ?? data.fragment_index);
  const totalFragments = valueText(data.totalFragments ?? data.total_fragments);
  const vault = valueText(data.vault);
  const session = valueText(data.session);
  const contentHash = shortBufferish(data.contentHash ?? data.content_hash, 10, 10);
  const nonce = shortBufferish(data.nonce, 8, 8);
  const timestamp = Number(valueText(data.timestamp));
  const effectiveTime = event.blockTime ?? (timestamp > 0 ? timestamp : null);
  const reconstruction = buildMemoryReconstruction(event, inscription);

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs text-muted-foreground">Interact with instruction</span>
            <span className="font-mono text-sm font-semibold text-foreground">{instruction}</span>
            <span className="text-xs text-muted-foreground">on</span>
            <Link
              href="https://solscan.io/account/SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-primary hover:underline"
            >
              SAPpUh…GpFETZ
            </Link>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link
              href={entityPath('/transactions', event.txSignature)}
              className="font-mono text-xs text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {short(event.txSignature, 14, 12)}
            </Link>
            <button
              type="button"
              onClick={() => onCopy(event.txSignature)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Copy transaction signature"
            >
              {copied === event.txSignature ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <Link
              href={entityPath('/transactions', event.txSignature)}
              className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Inspect Tx
              <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              href={`https://solscan.io/tx/${event.txSignature}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Solscan
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="text-left text-xs text-muted-foreground lg:text-right">
          <p className="font-mono text-foreground">Slot {event.slot}</p>
          {effectiveTime && (
            <p>
              {event.blockTime ? 'Block Time' : 'Event Time'} · {timeAgo(effectiveTime)} · {formatUtc(effectiveTime)}
            </p>
          )}
          <p className="mt-1 text-emerald-500">Success · finalized</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <PreviewField label="Vault" value={vault ? short(vault, 8, 8) : '—'} href={vault ? entityPath('/vaults', vault) : undefined} />
        <PreviewField label="Session" value={session ? short(session, 8, 8) : '—'} />
        <PreviewField label="Sequence" value={sequence || '—'} mono />
        <PreviewField label="Epoch" value={epochIndex || '—'} mono />
        <PreviewField label="Payload" value={dataLen ? `${dataLen} bytes` : '—'} mono />
        <PreviewField label="Fragment" value={fragmentIndex && totalFragments ? `${Number(fragmentIndex) + 1}/${totalFragments}` : '—'} mono />
        <PreviewField label="Content Hash" value={contentHash || '—'} mono />
        <PreviewField label="Nonce" value={nonce || '—'} mono />
      </div>

      {timestamp > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Memory timestamp {formatUtc(timestamp)}
        </p>
      )}

      <FragmentsPreview fragments={fragments.length > 0 ? fragments : (inscription ? [inscription] : [])} />

      <div className="mt-4 border-t pt-3">
        <Button
          type="button"
          size="sm"
          onClick={() => setReconstructOpen((open) => !open)}
          className="h-9 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          aria-expanded={reconstructOpen}
        >
          Reconstruct
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', reconstructOpen && 'rotate-180')}
            aria-hidden
          />
        </Button>

        {reconstructOpen && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <ReconstructBlock title="Instruction Data" value={reconstruction.instructionData} />
            <ReconstructBlock title="Events" value={reconstruction.events} />
            <JsonMemoryBlock value={reconstruction.jsonMemory} />
          </div>
        )}
      </div>
    </div>
  );
}

function TxRow({
  signature,
  slot,
  blockTime,
  title,
  subtitle,
  payload,
  fragments,
  copied,
  onCopy,
}: {
  signature: string;
  slot: number;
  blockTime: number | null;
  title: string;
  subtitle: string;
  payload: unknown;
  fragments?: ParsedInscription[];
  copied: string | null;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <span className="font-mono text-xs text-muted-foreground">Slot {slot}</span>
          </div>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={entityPath('/transactions', signature)}
              className="truncate rounded bg-muted/40 px-2 py-1 font-mono text-xs text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {short(signature, 12, 10)}
            </Link>
            <Link
              href={entityPath('/transactions', signature)}
              className="inline-flex h-9 items-center gap-1 rounded-md border bg-background px-3 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Inspect Tx
            </Link>
            <button
              type="button"
              onClick={() => onCopy(signature)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Copy transaction signature"
            >
              {copied === signature ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <Link
              href={`https://solscan.io/tx/${signature}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1 rounded-md border bg-background px-3 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Solscan
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <div className="text-left text-xs text-muted-foreground md:text-right">
          {blockTime && <p>{timeAgo(blockTime)}</p>}
          <button
            type="button"
            onClick={() => onCopy(JSON.stringify(payload, null, 2))}
            className="mt-1 inline-flex h-9 items-center rounded-md px-2 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Copy payload
          </button>
        </div>
      </div>
      <FragmentsPreview fragments={fragments ?? []} />
    </div>
  );
}

function FragmentsPreview({ fragments }: { fragments: ParsedInscription[] }) {
  if (fragments.length === 0) return null;
  const sorted = [...fragments].sort((a, b) => a.fragmentIndex - b.fragmentIndex || a.sequence - b.sequence);

  return (
    <div className="mt-3 rounded-lg border bg-muted/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-xs font-semibold text-foreground">
          Fragments
        </p>
        <span className="font-mono text-[11px] text-muted-foreground">
          {sorted.length} associated with this tx
        </span>
      </div>
      <div className="divide-y">
        {sorted.map((fragment) => {
          const decoded = jsonMemory(fragment.encryptedData);
          const decodedText = typeof decoded === 'string' ? decoded : JSON.stringify(decoded, null, 2);
          return (
            <div
              key={`${fragment.txSignature}:${fragment.sequence}:${fragment.fragmentIndex}:${fragment.contentHash}`}
              className="grid gap-3 p-3 lg:grid-cols-[220px_1fr]"
            >
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Fragment</span>
                  <span className="font-mono text-foreground">
                    {fragment.fragmentIndex + 1}/{fragment.totalFragments}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Sequence</span>
                  <span className="font-mono text-foreground">{fragment.sequence}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Bytes</span>
                  <span className="font-mono text-foreground">{fragment.dataLen}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Hash</span>
                  <span className="font-mono text-foreground">{short(fragment.contentHash, 8, 8)}</span>
                </div>
              </div>
              <pre className="max-h-44 overflow-auto rounded-md bg-background p-3 text-xs leading-5 text-muted-foreground">
                {decodedText}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReconstructBlock({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20">
      <div className="border-b px-3 py-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
      </div>
      <pre className="max-h-[420px] overflow-auto p-3 text-xs leading-5 text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function JsonMemoryBlock({ value }: { value: unknown }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 lg:col-span-2">
      <div className="border-b px-3 py-2">
        <p className="text-xs font-semibold text-foreground">JSON Memory</p>
      </div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap p-3 text-xs leading-5 text-muted-foreground">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function PreviewField({
  label,
  value,
  href,
  mono,
}: {
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
}) {
  const content = (
    <span className={cn('truncate text-xs text-foreground', mono && 'font-mono tabular-nums')}>
      {value}
    </span>
  );
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 px-3 py-2">
      <p className="mb-1 text-[11px] text-muted-foreground">{label}</p>
      {href ? (
        <Link href={href} className="block truncate text-primary hover:underline">
          {content}
        </Link>
      ) : content}
    </div>
  );
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  return asText(value);
}

function bufferBytes(value: unknown): number[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.data)) {
      return obj.data.map((item) => Number(item)).filter((item) => Number.isFinite(item));
    }
    if (typeof obj.data === 'object' && obj.data) return bufferBytes(obj.data);
  }
  if (typeof value === 'string') {
    return /^[A-Fa-f0-9]+$/.test(value) && value.length % 2 === 0
      ? hexToBytes(value)
      : base64ToBytes(value);
  }
  return [];
}

function hexToBytes(value: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < value.length; i += 2) {
    const byte = Number.parseInt(value.slice(i, i + 2), 16);
    if (Number.isFinite(byte)) out.push(byte);
  }
  return out;
}

function base64ToBytes(value: string): number[] {
  try {
    const binary = atob(value);
    return Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return [];
  }
}

function typedBytes(value: unknown, previewSize = 100) {
  const data = bufferBytes(value);
  const chunks: Record<string, number[]> = {};
  for (let i = 0; i < data.length; i += previewSize) {
    chunks[`${i} - ${Math.min(i + previewSize, data.length)}`] = data.slice(i, i + previewSize);
  }
  return {
    type: 'Buffer',
    bytes: data.length,
    data: chunks,
  };
}

function bytesToText(value: unknown): string {
  const data = bufferBytes(value);
  if (data.length === 0) return '';
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(data));
  } catch {
    return '';
  }
}

function jsonMemory(value: unknown): unknown {
  const text = bytesToText(value).trim();
  if (!text) return 'No text payload decoded from memory bytes.';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = text.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch { /* fall through to full text */ }
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildMemoryReconstruction(event: VaultDetailEvent, inscription: ParsedInscription | null) {
  const data = event.data ?? {};
  const encryptedData = inscription?.encryptedData ?? data.encryptedData ?? data.encrypted_data;
  const nonce = inscription?.nonce ?? data.nonce;
  const contentHash = inscription?.contentHash ?? data.contentHash ?? data.content_hash;
  const sequence = inscription ? String(inscription.sequence) : valueText(data.sequence);
  const totalFragments = inscription?.totalFragments ?? Number(valueText(data.totalFragments ?? data.total_fragments) || 1);
  const fragmentIndex = inscription?.fragmentIndex ?? Number(valueText(data.fragmentIndex ?? data.fragment_index) || 0);
  const compression = inscription?.compression ?? Number(valueText(data.compression) || 0);
  const epochIndex = inscription ? String(inscription.epochIndex) : valueText(data.epochIndex ?? data.epoch_index);
  const dataLen = inscription?.dataLen ?? Number(valueText(data.dataLen ?? data.data_len) || bufferBytes(encryptedData).length);
  const timestamp = inscription?.timestamp ? String(inscription.timestamp) : valueText(data.timestamp);
  const nonceVersion = inscription?.nonceVersion ?? Number(valueText(data.nonceVersion ?? data.nonce_version) || 0);
  const vault = inscription?.vault ?? valueText(data.vault);
  const session = inscription?.session ?? valueText(data.session);

	  return {
	    instructionData: {
      sequence: { type: 'u32', data: sequence },
      encrypted_data: { type: 'bytes', data: typedBytes(encryptedData) },
      nonce: { type: { array: ['u8', 12] }, data: bufferBytes(nonce) },
      content_hash: { type: { array: ['u8', 32] }, data: bufferBytes(contentHash) },
      total_fragments: { type: 'u8', data: totalFragments },
      fragment_index: { type: 'u8', data: fragmentIndex },
      compression: { type: 'u8', data: compression },
      epoch_index: { type: 'u32', data: epochIndex },
    },
	    events: [
      {
        name: event.name,
        data: {
          vault,
          session,
          sequence: Number(sequence || 0),
          epochIndex: Number(epochIndex || 0),
          encryptedData: { type: 'Buffer', bytes: dataLen, data: typedBytes(encryptedData).data },
          nonce: bufferBytes(nonce),
          contentHash: bufferBytes(contentHash),
          totalFragments,
          fragmentIndex,
          compression,
          dataLen,
          nonceVersion,
          timestamp,
        },
      },
	    ],
	    jsonMemory: jsonMemory(encryptedData),
	  };
	}

function memoryEventKey(signature: string, sequence: number, fragmentIndex: number): string {
  return `${signature}:${sequence}:${fragmentIndex}`;
}

function dedupeVaultEvents(items: VaultDetailEvent[]): VaultDetailEvent[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const sequence = valueText(item.data?.sequence);
    const fragmentIndex = valueText(item.data?.fragmentIndex ?? item.data?.fragment_index);
    const contentHash = shortBufferish(item.data?.contentHash ?? item.data?.content_hash, 32, 32);
    const key = [
      item.txSignature,
      item.name,
      sequence,
      fragmentIndex,
      contentHash,
    ].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeParsedInscriptions(items: ParsedInscription[]): ParsedInscription[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.txSignature}:${item.sequence}:${item.fragmentIndex}:${item.contentHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeParsedLedgerEntries(items: ParsedLedgerEntry[]): ParsedLedgerEntry[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.txSignature}:${item.entryIndex}:${item.contentHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupFragmentsBySignature(items: ParsedInscription[]): Map<string, ParsedInscription[]> {
  const groups = new Map<string, ParsedInscription[]>();
  for (const item of items) {
    const current = groups.get(item.txSignature) ?? [];
    current.push(item);
    groups.set(item.txSignature, current);
  }
  for (const [signature, fragments] of groups) {
    groups.set(
      signature,
      fragments.sort((a, b) => a.sequence - b.sequence || a.fragmentIndex - b.fragmentIndex),
    );
  }
  return groups;
}

function shortBufferish(value: unknown, left: number, right: number): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return short(value.join(','), left, right);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.data)) return short(obj.data.join(','), left, right);
  }
  return short(value, left, right);
}

function formatUtc(tsSeconds: number): string {
  return new Date(tsSeconds * 1000).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }) + ' UTC';
}
