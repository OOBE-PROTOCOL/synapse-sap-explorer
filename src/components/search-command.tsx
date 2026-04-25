'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Wrench, DollarSign, Search } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '~/components/ui/command';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';
import { short } from '~/lib/format';
import { useGlobalSearch } from '~/hooks/use-sap';

const TYPE_META: Record<string, { icon: React.ElementType; color: string; href: (r: SearchResultItem) => string }> = {
  agent:  { icon: Bot,        color: 'text-primary',    href: (r) => `/agents/${r.wallet ?? r.pda}` },
  tool:   { icon: Wrench,     color: 'text-primary',  href: (r) => `/tools/${r.pda}` },
  escrow: { icon: DollarSign, color: 'text-emerald-400', href: (r) => `/escrows/${r.pda}` },
};

type SearchResultItem = { pda: string; name: string | null; wallet: string | null; type: string };

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { data, loading } = useGlobalSearch(query);

  const results = data?.results ?? [];

  // ⌘K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery('');
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex w-full items-center gap-2 rounded-xl bg-muted/30 border border-border/40 px-3 h-9 text-xs text-muted-foreground/60 hover:border-primary/40 hover:shadow-[0_0_12px_-3px_hsl(var(--glow)/0.25)] transition-all duration-300"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className='text-xs'>Search agents, PDAs...</span>
        <kbd className="ml-auto pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border/50 bg-muted/50 px-1.5 font-mono text-micro font-medium text-muted-foreground/70 sm:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search agents, tools, escrows…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[400px]">
          {query.length < 2 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </div>
          )}

          {query.length >= 2 && loading && (
            <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">
              Searching…
            </div>
          )}

          {query.length >= 2 && !loading && results.length === 0 && (
            <CommandEmpty>No results for &ldquo;{query}&rdquo;</CommandEmpty>
          )}

          {results.length > 0 && (
            <>
              {(['agent', 'tool', 'escrow'] as const).map((type) => {
                const grouped = results.filter((r) => r.type === type);
                if (grouped.length === 0) return null;
                const meta = TYPE_META[type] ?? TYPE_META.agent;
                const Icon = meta.icon;
                return (
                  <CommandGroup key={type} heading={`${type.charAt(0).toUpperCase()}${type.slice(1)}s`}>
                    {grouped.map((r, i) => (
                      <CommandItem
                        key={`${r.type}-${r.pda}-${i}`}
                        value={`${r.name ?? ''} ${r.pda}`}
                        onSelect={() => handleSelect(meta.href(r))}
                        className="cursor-pointer"
                      >
                        <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center bg-muted/30', meta.color)}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {r.name ?? short(r.pda, 8, 4)}
                            </span>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {r.type}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground font-mono truncate">
                            {r.pda}
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
