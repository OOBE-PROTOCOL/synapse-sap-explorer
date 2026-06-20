'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react';
import { cn } from '~/lib/utils';
import { asText, entityPath, short } from '~/lib/format';
import type { AgentMap } from '~/types/api';
import { useAgentMapCtx } from '~/providers/sap-data-provider';

/** Resolve agentMap entry by either wallet or PDA. */
function resolveEntry(addressValue: unknown, agentMap: AgentMap) {
  const address = asText(addressValue);
  const direct = agentMap[address];
  if (direct) return { entry: direct, walletAddress: address, address };
  // Reverse lookup: address might be a PDA
  for (const [wallet, entry] of Object.entries(agentMap)) {
    if (entry?.pda === address) return { entry, walletAddress: wallet, address };
  }
  return { entry: null, walletAddress: address, address };
}

/**
 * AgentTag — renders a wallet OR PDA as an agent name badge if known,
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
  address: unknown;
  agentMap?: AgentMap;
  className?: string;
  showIcon?: boolean;
  truncate?: boolean;
}) {
  const { map: ctxMap } = useAgentMapCtx();
  const agentMap = agentMapProp ?? ctxMap;
  const { entry, walletAddress, address: normalizedAddress } = resolveEntry(address, agentMap);
  const displayName = entry?.name || (truncate ? short(normalizedAddress, 4, 4) : normalizedAddress);
  const href = entry ? entityPath('/agents', walletAddress) : entityPath('/address', normalizedAddress);

  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium transition-colors',
        entry
          ? 'text-primary hover:text-primary/80'
          : 'text-muted-foreground hover:text-foreground font-mono',
        'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      title={entry ? `${entry.name} (${normalizedAddress})` : normalizedAddress}
    >
      {showIcon && entry && <Bot className="h-3 w-3 shrink-0" />}
      <span
        className={cn(
          truncate ? 'truncate max-w-[140px]' : '[overflow-wrap:anywhere]',
        )}
      >
        {displayName}
      </span>
    </Link>
  );
}

/**
 * Resolves an address to an agent name string, or returns truncated address.
 * For use in non-React contexts (table cells, etc.)
 */
export function resolveAgentName(
  address: unknown,
  agentMap: AgentMap,
  fallbackTruncate = true,
): string {
  const { entry, address: normalizedAddress } = resolveEntry(address, agentMap);
  if (entry?.name) return entry.name;
  return fallbackTruncate ? short(normalizedAddress, 4, 4) : normalizedAddress;
}
