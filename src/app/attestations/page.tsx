'use client';

import { useState, useMemo } from 'react';
import { Shield, ShieldCheck, Users, FileCheck } from 'lucide-react';
import { ExplorerPageShell, ExplorerMetric, ExplorerFilterBar, Skeleton, EmptyState, Address, StatusBadge, ExplorerPagination, usePagination } from '~/components/ui';
import type { FilterChip } from '~/components/ui/explorer-primitives';
import { Card } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '~/components/ui/table';
import { useAttestations, useAgents } from '~/hooks/use-sap';
import { useAgentMapCtx } from '~/providers/sap-data-provider';
import { AgentTag } from '~/components/ui/agent-tag';

export default function AttestationsPage() {
  const { data, loading, error } = useAttestations();
  const { data: agentsData } = useAgents({ limit: '100' });
  const { map: walletAgentMap } = useAgentMapCtx();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [onlyActive, setOnlyActive] = useState(false);

  const enriched = useMemo(() => {
    if (!data?.attestations) return [];
    return data.attestations.map((a) => {
      const agent = agentsData?.agents.find((ag) => ag.pda === a.agent);
      return { ...a, agentName: agent?.identity?.name ?? null };
    });
  }, [data, agentsData]);

  const types = useMemo(
    () => [...new Set(enriched.map((a) => a.attestationType).filter(Boolean))],
    [enriched],
  );

  const filtered = enriched.filter((a) => {
    if (onlyActive && !a.isActive) return false;
    if (typeFilter !== 'all' && a.attestationType !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.pda.toLowerCase().includes(q) ||
      a.agent.toLowerCase().includes(q) ||
      a.attester.toLowerCase().includes(q) ||
      a.attestationType.toLowerCase().includes(q) ||
      (a.agentName ?? '').toLowerCase().includes(q)
    );
  });

  const { page, perPage, setPage, setPerPage, paginate } = usePagination(filtered.length, 25);
  const paginated = useMemo(() => paginate(filtered), [paginate, filtered]);

  const stats = useMemo(() => {
    const total = enriched.length;
    const active = enriched.filter(a => a.isActive).length;
    const expired = enriched.filter(a => a.expiresAt !== '0' && Number(a.expiresAt) * 1000 < Date.now()).length;
    const uniqueAttesters = new Set(enriched.map(a => a.attester)).size;
    return { total, active, expired, uniqueAttesters };
  }, [enriched]);

  const filterChips: FilterChip[] = [
    ...(typeFilter !== 'all' ? [{ key: 'type', label: 'Type', value: typeFilter, onClear: () => setTypeFilter('all') }] : []),
    ...(onlyActive ? [{ key: 'active', label: 'Status', value: 'Active only', onClear: () => setOnlyActive(false) }] : []),
  ];

  if (loading) return (
    <div className="space-y-6 animate-fade-in">
      <Skeleton className="h-10 w-[300px]" />
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[72px]" />)}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    </div>
  );

  return (
    <ExplorerPageShell
      title="Attestations"
      subtitle="Web-of-Trust — on-chain attestations between agents and attesters"
      icon={<Shield className="h-5 w-5" />}
      badge={<Badge variant="secondary" className="tabular-nums text-xs">{stats.total} attestations</Badge>}
      stats={
        <>
          <ExplorerMetric icon={<Shield className="h-3.5 w-3.5" />} label="Total" value={stats.total} accent="primary" />
          <ExplorerMetric icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Active" value={stats.active} accent="emerald" />
          <ExplorerMetric icon={<FileCheck className="h-3.5 w-3.5" />} label="Expired" value={stats.expired} accent="rose" />
          <ExplorerMetric icon={<Users className="h-3.5 w-3.5" />} label="Unique Attesters" value={stats.uniqueAttesters} accent="cyan" />
        </>
      }
    >
      <ExplorerFilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search attestations…"
        filters={filterChips}
      >
        {types.length > 0 && (
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-40 text-xs bg-muted/30 border-border/50">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2">
          <Checkbox
            id="active-only"
            checked={onlyActive}
            onCheckedChange={(v) => setOnlyActive(v === true)}
          />
          <Label htmlFor="active-only" className="text-xs text-muted-foreground cursor-pointer">
            Active only
          </Label>
        </div>
      </ExplorerFilterBar>

      {error ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState message={search || typeFilter !== 'all' || onlyActive ? 'No attestations match filters' : 'No attestations found on-chain'} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[25%]">Agent</TableHead>
                <TableHead className="w-[25%]">Attester</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((a) => {
                const isExpired = a.expiresAt !== '0' && Number(a.expiresAt) * 1000 < Date.now();
                return (
                  <TableRow key={a.pda} className="hover:bg-muted/50">
                    <TableCell>
                      <p className="text-sm font-medium text-foreground truncate">{a.agentName ?? 'Unknown'}</p>
                      <Address value={a.agent} copy className="text-[10px]" />
                    </TableCell>
                    <TableCell>
                      <AgentTag address={a.attester} agentMap={walletAgentMap} className="text-xs" />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{a.attestationType || 'unknown'}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {a.createdAt !== '0' ? new Date(Number(a.createdAt) * 1000).toLocaleDateString() : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {isExpired ? (
                        <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                      ) : (
                        <StatusBadge active={a.isActive} size="xs" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ExplorerPagination
            page={page}
            total={filtered.length}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        </Card>
      )}
    </ExplorerPageShell>
  );
}
