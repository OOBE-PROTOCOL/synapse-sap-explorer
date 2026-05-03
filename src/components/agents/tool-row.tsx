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
  inscribedSchemaCount?: number;
};

const TYPE_ORDER: Record<string, number> = { input: 0, output: 1, description: 2 };

export function ToolRow({
  pda,
  toolName,
  httpMethod,
  category,
  totalInvocations = 0,
  inscribedSchemaCount = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  // Lazy-fetch only after first expand.
  const { data, loading, error } = useToolSchemas(open ? pda : null);

  const schemas: InscribedSchema[] = data?.schemas ?? [];
  const expectedTypes: number[] = (data as { expectedTypes?: number[] } | null)?.expectedTypes ?? [];
  const scanned = (data as { scannedSignatures?: number } | null)?.scannedSignatures ?? 0;
  const reachedCap = (data as { reachedCap?: boolean } | null)?.reachedCap ?? false;
  const sorted = [...schemas].sort(
    (a, b) => (TYPE_ORDER[a.schemaType] ?? 99) - (TYPE_ORDER[b.schemaType] ?? 99),
  );

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-800/40 transition-colors hover:border-neutral-700">
      {/* ── Header row ───────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-neutral-500 transition-transform',
            open && 'rotate-180 text-neutral-300',
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-white">
          {toolName}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {httpMethod && (
            <Badge className="bg-emerald-500/15 text-[10px] uppercase tracking-wider text-emerald-400">
              {httpMethod}
            </Badge>
          )}
          {category && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {category}
            </Badge>
          )}
          {inscribedSchemaCount > 0 && (
            <span className="hidden items-center gap-1 rounded-full border border-sky-900/50 bg-sky-950/30 px-2 py-0.5 text-[10px] font-medium text-sky-300 sm:inline-flex">
              <FileJson className="h-3 w-3" />
              {inscribedSchemaCount} schema{inscribedSchemaCount === 1 ? '' : 's'}
            </span>
          )}
          <span className="hidden text-xs tabular-nums text-neutral-500 md:inline">
            {totalInvocations.toLocaleString()} calls
          </span>
        </div>
      </button>

      {/* ── Expanded body ────────────────────────────────────── */}
      {open && (
        <div className="border-t border-neutral-800/80 bg-neutral-900/40 px-4 py-3">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-xs text-neutral-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Fetching inscribed schemas from chain…
            </div>
          )}

          {!loading && error && (
            <p className="py-4 text-xs text-amber-400">Failed to load schemas: {error}</p>
          )}

          {!loading && !error && sorted.length === 0 && (
            <div className="py-4 text-xs text-neutral-500 space-y-1">
              {expectedTypes.length === 0 ? (
                <p>
                  This tool was published without inscribing any JSON schema on-chain
                  (all <code className="text-neutral-400">schemaHash</code> fields are zero).
                </p>
              ) : reachedCap ? (
                <>
                  <p className="text-amber-400">
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
                  No <code className="text-neutral-400">ToolSchemaInscribedEvent</code>{' '}
                  found across {scanned.toLocaleString()} transactions for this tool PDA.
                </p>
              )}
            </div>
          )}

          {!loading && sorted.length > 0 && (
            <div className="space-y-3">
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
    <div className="rounded-md border border-neutral-800/80 bg-neutral-950/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800/80 px-3 py-2">
        <Badge
          className={cn(
            'text-[10px] uppercase tracking-wider',
            schema.schemaType === 'input' && 'bg-sky-500/15 text-sky-300',
            schema.schemaType === 'output' && 'bg-violet-500/15 text-violet-300',
            schema.schemaType === 'description' && 'bg-neutral-700/40 text-neutral-300',
          )}
        >
          {schema.schemaType}
        </Badge>
        <span className="font-mono text-[11px] text-neutral-500">v{schema.version}</span>
        {schema.verified ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
            <ShieldCheck className="h-3 w-3" />
            hash verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400">
            <ShieldAlert className="h-3 w-3" />
            hash mismatch
          </span>
        )}
        {schema.compression === 1 && (
          <span className="text-[10px] text-neutral-500">deflate-compressed</span>
        )}
        <span className="ml-auto font-mono text-[10px] text-neutral-600" title={schema.schemaHash}>
          {schema.schemaHash.slice(0, 8)}…{schema.schemaHash.slice(-6)}
        </span>
        <a
          href={`https://solscan.io/tx/${schema.txSignature}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-300"
        >
          tx <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
      <pre className="max-h-80 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-neutral-300">
        {pretty}
      </pre>
    </div>
  );
}
