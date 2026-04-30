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
import { Check, X, AlertTriangle } from 'lucide-react';
import { cn } from '~/lib/utils';
import { SectionLabel } from '~/components/ui/agent-profile-primitives';

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
    info?: boolean;
  }> = [
    {
      label: 'Stake',
      ok: stakeOk,
      detail: (
        <span>
          {stake.toFixed(4)} / {MIN_STAKE_SOL} SOL
        </span>
      ),
    },
    {
      label: 'Tools',
      ok: hasTool,
      detail: <span>{tools.length} published</span>,
    },
    {
      label: 'Schemas',
      ok: allSchemas,
      detail: (
        <span>
          {toolsWithSchema}/{tools.length || 0} inscribed
        </span>
      ),
    },
    {
      label: 'Tokens',
      ok: true,
      info: true,
      detail: <span>SOL · USDC</span>,
    },
  ];

  const passed = checks.filter((c) => c.ok && !c.info).length;
  const total = checks.filter((c) => !c.info).length;
  const fullyReady = passed === total;

  return (
    <div className={cn('space-y-2', className)}>
      <SectionLabel
        hint={
          fullyReady ? (
            <span className="text-emerald-400">routable · {passed}/{total}</span>
          ) : (
            <span className="text-amber-400">{passed}/{total} ready</span>
          )
        }
      >
        Merchant Readiness
      </SectionLabel>
      <ul className="grid grid-cols-2 gap-1.5 mt-1.5" aria-label="Merchant requirements">
        {checks.map((c) => (
          <li
            key={c.label}
            className={cn(
              'flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]',
              c.info
                ? 'border-neutral-800 bg-neutral-900/40'
                : c.ok
                  ? 'border-emerald-900/60 bg-emerald-950/20'
                  : 'border-amber-900/60 bg-amber-950/20',
            )}
            title={
              c.info
                ? 'Protocol-enforced allowlist'
                : c.ok
                  ? 'Requirement met'
                  : 'Requirement not met — agent is not routable by automated clients'
            }
          >
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                c.info
                  ? 'bg-neutral-800 text-neutral-400'
                  : c.ok
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-amber-500/20 text-amber-400',
              )}
              aria-hidden
            >
              {c.info ? (
                <span className="text-[8px] font-semibold leading-none">i</span>
              ) : c.ok ? (
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              ) : (
                <X className="h-2.5 w-2.5" strokeWidth={3} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-neutral-200">{c.label}</span>
              <span className="block truncate text-[10px] text-neutral-500 tabular-nums">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {!fullyReady && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-900/40 bg-amber-950/20 px-2 py-1.5 text-[10px] text-amber-300/90">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            Agent does not meet the v0.2.0 merchant minimum and is not callable by automated routers (LLMs, x402
            clients).
          </span>
        </div>
      )}
    </div>
  );
}
