'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react';
import { cn } from '~/lib/utils';
import type { AgentMap } from '~/types/api';
import { useAgentMapCtx } from '~/providers/sap-data-provider';

/**
 * AgentTag — renders a wallet address as an agent name badge if known,
 * otherwise shows a truncated address. Links to the agent/address page.
 *
 * If `agentMap` is not provided, reads from SapDataProvider context automatically.
 */
export function AgentTag({
  address,
  agentMap: agentMapProp,
  className,
  showIcon = true,
  truncate = true,
}: {
  address: string;
  agentMap?: AgentMap;
  className?: string;
  showIcon?: boolean;
  truncate?: boolean;
}) {
  const { map: ctxMap } = useAgentMapCtx();
  const agentMap = agentMapProp ?? ctxMap;
  const entry = agentMap[address];
  const displayName = entry?.name || (truncate ? `${address.slice(0, 4)}…${address.slice(-4)}` : address);
  const href = entry ? `/agents/${address}` : `/address/${address}`;

  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium transition-colors',
        entry
          ? 'text-primary hover:text-primary/80'
          : 'text-muted-foreground hover:text-foreground font-mono',
        className,
      )}
      title={entry ? `${entry.name} (${address})` : address}
    >
      {showIcon && entry && <Bot className="h-3 w-3 shrink-0" />}
      <span className="truncate max-w-[140px]">{displayName}</span>
    </Link>
  );
}

/**
 * Resolves an address to an agent name string, or returns truncated address.
 * For use in non-React contexts (table cells, etc.)
 */
export function resolveAgentName(
  address: string,
  agentMap: AgentMap,
  fallbackTruncate = true,
): string {
  const entry = agentMap[address];
  if (entry?.name) return entry.name;
  return fallbackTruncate ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}
