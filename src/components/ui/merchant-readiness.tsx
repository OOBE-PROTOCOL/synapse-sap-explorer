'use client';

/**
 * Merchant Readiness — v0.10 / SAP program v0.2.0+
 *
 * Visual checklist of the four requirements an agent MUST satisfy to
 * accept escrows under the post-hardening protocol:
 *
 *   1. Stake     ≥ MIN_AGENT_STAKE_LAMPORTS (0.1 SOL)  PDA: ["sap_stake", agent]
 *   2. Tools     ≥ 1 published `ToolAccount`           PDA: ["sap_tool", agent, tool_id]
 *   3. Schema    every tool has an inscribed JSON-Schema (input + output hashes non-zero)
 *   4. Tokens    SOL or USDC only — enforced on-chain by `validate_payment_token`
 *
 * Source of truth: `synapse-sap-sdk@0.10.0` constants & validators.
 */

import * as React from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';
import { cn } from '~/lib/utils';
import { SectionLabel } from '~/components/ui/agent-profile-primitives';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';

const MIN_STAKE_SOL = 0.1;

type ToolLike = {
  descriptor: {
    inputSchemaHash?: number[] | null;
    outputSchemaHash?: number[] | null;
  } | null;
  hasInscribedSchema?: boolean;
};

export type MerchantReadinessProps = {
  stakedSol: number | null;
  tools: ToolLike[];
  className?: string;
};

function hashIsNonZero(h: number[] | null | undefined): boolean {
  if (!h || h.length === 0) return false;
  return h.some((b) => b !== 0);
}

function toolHasSchema(t: ToolLike): boolean {
  if (t.hasInscribedSchema) return true;
  return hashIsNonZero(t.descriptor?.inputSchemaHash) && hashIsNonZero(t.descriptor?.outputSchemaHash);
}

export function MerchantReadiness({ stakedSol, tools, className }: MerchantReadinessProps) {
  const stake = stakedSol ?? 0;
  const stakeOk = stake >= MIN_STAKE_SOL;
  const hasTool = tools.length > 0;
  const toolsWithSchema = tools.filter(toolHasSchema).length;
  const allSchemas = hasTool && toolsWithSchema === tools.length;

  // Token allowlist is protocol-enforced (SOL + USDC only) and not derived
  // from per-agent state — render as informational, always ✓.
  const checks: Array<{
    label: string;
    ok: boolean;
    detail: React.ReactNode;
    /** Tooltip body explaining what this requirement means. */
    hint: string;
    info?: boolean;
  }> = [
    {
      label: 'Stake',
      ok: stakeOk,
      detail: (
        <>
          <span className="tabular-nums text-foreground">{stake.toFixed(4)}</span>
          <span className="text-muted-foreground"> / {MIN_STAKE_SOL} SOL</span>
        </>
      ),
      hint: `Agents must lock at least ${MIN_STAKE_SOL} SOL at PDA ["sap_stake", agent]. Acts as the slashable floor for dispute resolution.`,
    },
    {
      label: 'Tools',
      ok: hasTool,
      detail: (
        <>
          <span className="tabular-nums text-foreground">{tools.length}</span>
          <span className="text-muted-foreground"> published</span>
        </>
      ),
      hint: 'Zero-tool agents are unrouteable. At least one ToolAccount must exist at PDA ["sap_tool", agent, tool_id].',
    },
    {
      label: 'Schemas',
      ok: allSchemas,
      detail: (
        <>
          <span className="tabular-nums text-foreground">
            {toolsWithSchema}/{tools.length || 0}
          </span>
          <span className="text-muted-foreground"> inscribed</span>
        </>
      ),
      hint: 'Every tool needs a JSON-Schema (inscribed or hashed) so LLM routers can call it without manual integration.',
    },
    {
      label: 'Tokens',
      ok: true,
      info: true,
      detail: (
        <span className="text-muted-foreground">
          SOL <span className="text-muted-foreground/70">·</span> USDC
        </span>
      ),
      hint: 'Payment token allowlist is protocol-enforced. Only SOL and the canonical USDC mint are accepted by validate_payment_token.',
    },
  ];

  const passed = checks.filter((c) => c.ok && !c.info).length;
  const total = checks.filter((c) => !c.info).length;
  const fullyReady = passed === total;

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn('space-y-3 px-4 py-3', className)}>
        <div className="flex items-center justify-between">
          <SectionLabel>Merchant Readiness</SectionLabel>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  'cursor-help rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider tabular-nums',
                  fullyReady
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                )}
              >
                {passed}/{total} {fullyReady ? 'routable' : 'ready'}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed">
              v0.2.0 merchant gate , agents must satisfy all four
              requirements to be callable by automated routers.
            </TooltipContent>
          </Tooltip>
        </div>

        <ul
          className="grid w-full list-none grid-cols-2 gap-2 p-0"
          aria-label="Merchant requirements"
        >
          {checks.map((c) => (
            <li key={c.label} className="w-full min-w-0">
              <Tooltip>
                <TooltipTrigger
                  className={cn(
                    'flex min-h-16 w-full cursor-help items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    c.info
                      ? 'bg-background hover:border-primary/30'
                      : c.ok
                        ? 'border-emerald-500/30 bg-emerald-500/10 hover:border-emerald-500/50'
                        : 'border-amber-500/30 bg-amber-500/10 hover:border-amber-500/50',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium leading-tight text-foreground">
                      {c.label}
                    </span>
                    <span className="mt-0.5 block truncate text-xs leading-tight">
                      {c.detail}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                      c.info
                        ? 'bg-muted text-muted-foreground'
                        : c.ok
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                          : 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
                    )}
                    aria-hidden
                  >
                    {c.info ? (
                      <Info className="h-3 w-3" strokeWidth={2.5} />
                    ) : c.ok ? (
                      <Check className="h-3 w-3" strokeWidth={3} />
                    ) : (
                      <X className="h-3 w-3" strokeWidth={3} />
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] text-xs leading-relaxed">
                  {c.hint}
                </TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>

        {!fullyReady && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300"
          >
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Agent does not meet the{' '}
              <span className="font-mono text-amber-900 dark:text-amber-200">v0.2.0</span>{' '}
              merchant minimum and is not callable by automated routers
              (LLMs, x402 clients).
            </span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
