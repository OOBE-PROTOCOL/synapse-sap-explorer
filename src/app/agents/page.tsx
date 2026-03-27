'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, SlidersHorizontal } from 'lucide-react';
import { PageHeader, ScoreRing, StatusBadge, Address, ProtocolBadge, EmptyState } from '~/components/ui';
import { Skeleton } from '~/components/ui/skeleton';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { useAgents } from '~/hooks/use-sap';
import type { SerializedDiscoveredAgent } from '~/lib/sap/discovery';

const SORT_OPTIONS = [
  { value: 'reputation', label: 'Reputation' },
  { value: 'calls', label: 'Calls' },
  { value: 'latency', label: 'Latency' },
  { value: 'uptime', label: 'Uptime' },
  { value: 'price', label: 'Price' },
];

export default function AgentsPage() {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('reputation');
  const [activeOnly, setActiveOnly] = useState(true);

  const { data, loading, error } = useAgents({
    sortBy,
    activeOnly: String(activeOnly),
    limit: '100',
  });

  const agents = data?.agents ?? [];

  const filtered = search
    ? agents.filter((a) => {
        const id = a.identity;
        if (!id) return false;
        const q = search.toLowerCase();
        return (
          id.name.toLowerCase().includes(q) ||
          id.description.toLowerCase().includes(q) ||
          a.pda.toLowerCase().includes(q) ||
          id.wallet.toLowerCase().includes(q)
        );
      })
    : agents;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Agents" subtitle={`${data?.total ?? '—'} agents discovered on-chain`} />

      {/* ── Filters ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, PDA, or wallet…"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant={activeOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveOnly(!activeOnly)}
          className="text-xs"
        >
          {activeOnly ? '● Active only' : '○ All agents'}
        </Button>
      </div>

      {/* ── Agent Table ──────────────────────── */}
      {loading ? (
        <Card>
          <CardContent className="p-0">
            <div className="space-y-0 divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="px-4 py-3">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-destructive">Error: {error}</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState message={search ? 'No agents match your search' : 'No agents discovered on-chain'} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell text-right">Calls</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Latency</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Uptime</TableHead>
                <TableHead className="hidden xl:table-cell">Protocols</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((agent, i) => (
                <AgentRow key={agent.pda} agent={agent} index={i + 1} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function AgentRow({ agent, index }: { agent: SerializedDiscoveredAgent; index: number }) {
  const id = agent.identity;
  const router = useRouter();
  if (!id) return null;

  return (
    <TableRow className="cursor-pointer" onClick={() => router.push(`/agents/${id.wallet}`)}>
        <TableCell className="font-mono text-xs text-muted-foreground w-12">{index}</TableCell>
        <TableCell>
          <div className="flex items-center gap-3">
            <ScoreRing score={id.reputationScore} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{id.name}</p>
              <Address value={agent.pda} />
            </div>
          </div>
        </TableCell>
        <TableCell className="hidden sm:table-cell">
          <StatusBadge active={id.isActive} />
        </TableCell>
        <TableCell className="hidden md:table-cell text-right">
          <span className="text-sm tabular-nums text-foreground">{Number(id.totalCallsServed).toLocaleString()}</span>
        </TableCell>
        <TableCell className="hidden lg:table-cell text-right">
          <span className="text-sm tabular-nums text-muted-foreground">{id.avgLatencyMs}ms</span>
        </TableCell>
        <TableCell className="hidden lg:table-cell text-right">
          <span className="text-sm tabular-nums text-muted-foreground">{id.uptimePercent}%</span>
        </TableCell>
        <TableCell className="hidden xl:table-cell">
          <div className="flex gap-1">
            {id.capabilities.slice(0, 2).map((c) => (
              <ProtocolBadge key={c.id} protocol={c.protocolId ?? c.id.split(':')[0]} />
            ))}
            {id.capabilities.length > 2 && (
              <Badge variant="secondary" className="text-[10px]">+{id.capabilities.length - 2}</Badge>
            )}
          </div>
        </TableCell>
    </TableRow>
  );
}
