'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, EmptyState, Address, StatusBadge, CategoryBadge, HttpMethodBadge } from '~/components/ui';
import { Skeleton } from '~/components/ui/skeleton';
import { Card, CardContent } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { useTools, useAgents } from '~/hooks/use-sap';

export default function ToolsPage() {
  const router = useRouter();
  const { data, loading, error } = useTools();
  const { data: agentsData } = useAgents({ limit: '100' });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const enrichedTools = useMemo(() => {
    if (!data?.tools) return [];
    return data.tools.map((t) => {
      const agent = agentsData?.agents.find((a) => a.pda === t.descriptor?.agent);
      return { pda: t.pda, descriptor: t.descriptor, agentName: agent?.identity?.name ?? null, agentWallet: agent?.identity?.wallet ?? null };
    });
  }, [data, agentsData]);

  const categories = useMemo(() => {
    if (!data?.categories) return [];
    return data.categories.map((c) => c.category).filter(Boolean);
  }, [data]);

  const filtered = enrichedTools.filter((t) => {
    const d = t.descriptor;
    if (!d) return false;
    if (categoryFilter && categoryFilter !== 'all') {
      const cat = typeof d.category === 'object' ? Object.keys(d.category)[0] : String(d.category);
      if (cat !== categoryFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const name = d.toolName.toLowerCase();
      const agent = (t.agentName ?? '').toLowerCase();
      if (!name.includes(q) && !agent.includes(q) && !t.pda.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Tool Registry" subtitle="On-chain tool descriptors registered in the SAP program">
        <Badge variant="outline" className="text-xs tabular-nums">{data?.total ?? 0} tools</Badge>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools…" className="max-w-sm" />
        {categories.length > 0 && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <Card><CardContent className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}</CardContent></Card>
      ) : error ? (
        <Card><CardContent className="py-8 text-center"><p className="text-sm text-destructive">{error}</p></CardContent></Card>
      ) : filtered.length === 0 ? (
        <EmptyState message={search || categoryFilter !== 'all' ? 'No tools match filters' : 'No tools discovered on-chain'} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool Name</TableHead>
                <TableHead className="hidden sm:table-cell">Method</TableHead>
                <TableHead className="hidden sm:table-cell">Category</TableHead>
                <TableHead className="hidden md:table-cell">Agent</TableHead>
                <TableHead className="text-right">Invocations</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Params</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tool) => {
                const d = tool.descriptor;
                if (!d) return null;
                const method = typeof d.httpMethod === 'object' ? Object.keys(d.httpMethod)[0] ?? 'GET' : String(d.httpMethod);
                const category = typeof d.category === 'object' ? Object.keys(d.category)[0] ?? 'Custom' : String(d.category);
                return (
                  <TableRow key={tool.pda} className="cursor-pointer" onClick={() => router.push(`/tools/${tool.pda}`)}>
                      <TableCell>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-foreground block truncate">{d.toolName}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{tool.pda.slice(0, 8)}…{tool.pda.slice(-4)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell"><HttpMethodBadge method={method} /></TableCell>
                      <TableCell className="hidden sm:table-cell"><CategoryBadge category={category} /></TableCell>
                      <TableCell className="hidden md:table-cell">
                        {tool.agentName ? (
                          <span className="text-xs text-foreground">{tool.agentName}</span>
                        ) : (
                          <span className="text-xs font-mono text-muted-foreground">{d.agent.slice(0, 8)}…</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right"><span className="text-sm font-semibold tabular-nums">{Number(d.totalInvocations).toLocaleString()}</span></TableCell>
                      <TableCell className="hidden lg:table-cell text-right"><span className="text-xs tabular-nums text-muted-foreground">{d.requiredParams}/{d.paramsCount}</span></TableCell>
                      <TableCell className="text-right"><StatusBadge active={d.isActive} size="xs" /></TableCell>
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
