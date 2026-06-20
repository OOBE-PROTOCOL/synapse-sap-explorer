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
import { entityPath, short } from '~/lib/format';
import { useGlobalSearch } from '~/hooks/use-sap';

const TYPE_META: Record<string, { icon: React.ElementType; color: string; href: (r: SearchResultItem) => string }> = {
  agent:  { icon: Bot,        color: 'text-primary',    href: (r) => entityPath('/agents', r.wallet ?? r.pda) },
  tool:   { icon: Wrench,     color: 'text-primary',  href: (r) => entityPath('/tools', r.pda) },
  escrow: { icon: DollarSign, color: 'text-primary', href: (r) => entityPath('/escrows', r.pda) },
};

type SearchResultItem = { pda: string; name: string | null; wallet: string | null; type: string };

function looksLikeSolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(value.trim());
}

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { data, loading } = useGlobalSearch(query);

  const results = data?.results ?? [];
  const canLookupAddress = looksLikeSolanaAddress(query);

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
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-11 w-full items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Open search"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">Search agents, tools, escrows</span>
        <kbd className="pointer-events-none ml-auto hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground sm:inline-flex">
          ⌘K
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

          {query.length >= 2 && !loading && results.length === 0 && !canLookupAddress && (
            <CommandEmpty>No results for &ldquo;{query}&rdquo;</CommandEmpty>
          )}

          {query.length >= 2 && !loading && canLookupAddress && (
            <CommandGroup heading={results.length > 0 ? 'Direct lookup' : 'Address lookup'}>
              <CommandItem
                value={`address ${query}`}
                onSelect={() => handleSelect(entityPath('/address', query.trim()))}
                className="cursor-pointer"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/30 text-primary">
                  <Search className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">Open address lookup</span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      address
                    </Badge>
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {query.trim()}
                  </div>
                </div>
              </CommandItem>
            </CommandGroup>
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
