'use client';

/**
 * Solscan-style expandable tool row.
 *
 * Collapsed: tool name, http method, category, total invocations.
 * Expanded:  inscribed schemas (input / output / description) with
 *            JSON viewer + on-chain hash verification status.
 *
 * Schemas are fetched lazily on first expand via {@link useToolSchemas}.
 */

import { useState } from 'react';
import { ChevronDown, FileJson, ShieldCheck, ShieldAlert, Loader2, ExternalLink } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { useToolSchemas } from '~/hooks/use-sap';
import type { InscribedSchema } from '~/types';
import { cn } from '~/lib/utils';

type Props = {
  pda: string;
  toolName: string;
  httpMethod?: string | null;
  category?: string | null;
  totalInvocations?: number;
  callsLabel?: string;
  callsTitle?: string;
  inscribedSchemaCount?: number;
};

const TYPE_ORDER: Record<string, number> = { input: 0, output: 1, description: 2 };

export function ToolRow({
  pda,
  toolName,
  httpMethod,
  category,
  totalInvocations = 0,
  callsLabel = 'calls',
  callsTitle,
  inscribedSchemaCount = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  // Lazy-fetch only after first expand.
  const { data, loading, error } = useToolSchemas(open ? pda : null);

  const schemas: InscribedSchema[] = data?.schemas ?? [];
  const expectedTypes: number[] = (data as { expectedTypes?: number[] } | null)?.expectedTypes ?? [];
  const missingSchemaLabels: string[] = (data as { missingSchemaLabels?: string[] } | null)?.missingSchemaLabels ?? [];
  const scanned = (data as { scannedSignatures?: number } | null)?.scannedSignatures ?? 0;
  const reachedCap = (data as { reachedCap?: boolean } | null)?.reachedCap ?? false;
  const warning = data?.warning;
  const sorted = [...schemas].sort(
    (a, b) => (TYPE_ORDER[a.schemaType] ?? 99) - (TYPE_ORDER[b.schemaType] ?? 99),
  );

  return (
    <div className="rounded-xl border bg-card shadow-sm transition-colors hover:border-primary/30">
      {/* ── Header row ───────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180 text-foreground',
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-foreground">
          {toolName}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {httpMethod && (
            <Badge className="bg-primary/10 text-[10px] uppercase text-primary dark:text-primary">
              {httpMethod}
            </Badge>
          )}
          {category && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {category}
            </Badge>
          )}
          {inscribedSchemaCount > 0 && (
            <span className="hidden items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary sm:inline-flex">
              <FileJson className="h-3 w-3" />
              {inscribedSchemaCount} schema{inscribedSchemaCount === 1 ? '' : 's'}
            </span>
          )}
          <span className="hidden text-xs tabular-nums text-muted-foreground md:inline" title={callsTitle}>
            {totalInvocations.toLocaleString()} {callsLabel}
          </span>
        </div>
      </button>

      {/* ── Expanded body ────────────────────────────────────── */}
      {open && (
        <div className="border-t bg-muted/20 px-4 py-3">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Fetching inscribed schemas from chain…
            </div>
          )}

          {!loading && error && (
            <p className="py-4 text-xs text-secondary-foreground">Failed to load schemas: {error}</p>
          )}

          {!loading && !error && sorted.length === 0 && (
            <div className="space-y-1 py-4 text-xs text-muted-foreground">
              {warning ? (
                <p className="text-secondary-foreground">
                  {warning}
                </p>
              ) : expectedTypes.length === 0 ? (
                <p>
                  This tool was published without inscribing any JSON schema on-chain
                  (all <code className="text-foreground">schemaHash</code> fields are zero).
                </p>
              ) : reachedCap ? (
                <>
                  <p className="text-secondary-foreground">
                    Scanned {scanned.toLocaleString()} most recent transactions
                    without finding the inscription. Inscriptions are emitted at
                    publish time and may be older than our scan window.
                  </p>
                  <p>
                    The tool declares {expectedTypes.length} schema slot{expectedTypes.length === 1 ? '' : 's'} on-chain
                    — hashes are present but the original inscription tx is out of reach.
                  </p>
                </>
              ) : (
                <p>
                  No <code className="text-foreground">ToolSchemaInscribedEvent</code>{' '}
                  found across {scanned.toLocaleString()} transactions for this tool PDA.
                </p>
              )}
            </div>
          )}

          {!loading && sorted.length > 0 && (
            <div className="space-y-3">
              {missingSchemaLabels.length > 0 && (
                <div className="rounded-lg border border-secondary/20 bg-secondary/5 px-3 py-2 text-xs text-secondary-foreground">
                  Descriptor declares {missingSchemaLabels.join(', ')} schema
                  {missingSchemaLabels.length === 1 ? '' : 's'} not present in the local cache yet.
                  A deep inscription repair is running; verified schemas already found are shown below.
                </div>
              )}
              {sorted.map((s) => (
                <SchemaBlock key={`${s.schemaType}-${s.version}-${s.txSignature}`} schema={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SchemaBlock({ schema }: { schema: InscribedSchema }) {
  const pretty = schema.schemaJson
    ? JSON.stringify(schema.schemaJson, null, 2)
    : schema.schemaData;

  return (
    <div className="rounded-lg border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Badge
          className={cn(
            'text-[10px] uppercase tracking-wider',
            schema.schemaType === 'input' && 'bg-primary/10 text-primary',
            schema.schemaType === 'output' && 'bg-primary/10 text-primary dark:text-primary',
            schema.schemaType === 'description' && 'bg-muted text-muted-foreground',
          )}
        >
          {schema.schemaType}
        </Badge>
        <span className="font-mono text-[11px] text-muted-foreground">v{schema.version}</span>
        {schema.verified ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
            <ShieldCheck className="h-3 w-3" />
            hash verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-secondary-foreground">
            <ShieldAlert className="h-3 w-3" />
            hash mismatch
          </span>
        )}
        {schema.compression === 1 && (
          <span className="text-[10px] text-muted-foreground">deflate-compressed</span>
        )}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground" title={schema.schemaHash}>
          {schema.schemaHash.slice(0, 8)}…{schema.schemaHash.slice(-6)}
        </span>
        <a
          href={`https://solscan.io/tx/${schema.txSignature}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          tx <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
      <pre className="max-h-80 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
        {pretty}
      </pre>
    </div>
  );
}
