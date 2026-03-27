'use client';

import { useState, useMemo } from 'react';
import { Search, Shield, ShieldCheck, ShieldX } from 'lucide-react';
import { PageHeader, Skeleton, EmptyState, Address, StatusBadge } from '~/components/ui';
import { Card } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '~/components/ui/table';
import { useAttestations, useAgents } from '~/hooks/use-sap';

export default function AttestationsPage() {
  const { data, loading, error } = useAttestations();
  const { data: agentsData } = useAgents({ limit: '100' });
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

  return (
    <div className="space-y-6">
      <PageHeader title="Attestations" subtitle="Web-of-Trust — on-chain attestations between agents and attesters">
        <Badge variant="secondary" className="tabular-nums">{data?.total ?? 0} attestations</Badge>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search attestations…"
            className="pl-9"
          />
        </div>
        {types.length > 0 && (
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
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
          <Label htmlFor="active-only" className="text-sm text-muted-foreground cursor-pointer">
            Active only
          </Label>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
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
              {filtered.map((a) => {
                const isExpired = a.expiresAt !== '0' && Number(a.expiresAt) * 1000 < Date.now();
                return (
                  <TableRow key={a.pda} className="hover:bg-muted/50">
                    <TableCell>
                      <p className="text-sm font-medium text-foreground truncate">{a.agentName ?? 'Unknown'}</p>
                      <Address value={a.agent} copy className="text-[10px]" />
                    </TableCell>
                    <TableCell>
                      <Address value={a.attester} copy />
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
        </Card>
      )}
    </div>
  );
}
