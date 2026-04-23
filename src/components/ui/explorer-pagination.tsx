'use client';

import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '~/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';

interface ExplorerPaginationProps {
  /** Current page (1-indexed) */
  page: number;
  /** Total number of items */
  total: number;
  /** Items per page */
  perPage: number;
  /** Callback when page changes */
  onPageChange: (page: number) => void;
  /** Callback when per-page changes */
  onPerPageChange?: (perPage: number) => void;
  /** Available per-page options */
  perPageOptions?: number[];
  /** Additional class name */
  className?: string;
}

export function ExplorerPagination({
  page,
  total,
  perPage,
  onPageChange,
  onPerPageChange,
  perPageOptions = [10, 25, 50, 100],
  className,
}: ExplorerPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const goTo = useCallback(
    (p: number) => {
      const clamped = Math.max(1, Math.min(p, totalPages));
      if (clamped !== page) onPageChange(clamped);
    },
    [page, totalPages, onPageChange],
  );

  // Generate visible page numbers (Solscan-style: 1 ... 4 5 [6] 7 8 ... 20)
  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-2.5 border-t border-border/40 bg-muted/20',
        className,
      )}
    >
      {/* Left: showing X of Y */}
      <div className="flex items-center gap-3">
        {onPerPageChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Show</span>
            <Select value={String(perPage)} onValueChange={(v) => onPerPageChange(Number(v))}>
              <SelectTrigger className="h-7 w-16 text-xs border-border/40 rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {perPageOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">
          {total === 0 ? (
            'No results'
          ) : (
            <>
              <span className="text-foreground/80 font-medium">{from.toLocaleString()}</span>
              {' – '}
              <span className="text-foreground/80 font-medium">{to.toLocaleString()}</span>
              {' of '}
              <span className="text-foreground/80 font-medium">{total.toLocaleString()}</span>
            </>
          )}
        </span>
      </div>

      {/* Right: page controls */}
      {totalPages > 1 && (
        <div className="flex items-center gap-0.5">
          {/* First */}
          <PaginationBtn
            onClick={() => goTo(1)}
            disabled={!canPrev}
            aria-label="First page"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </PaginationBtn>

          {/* Prev */}
          <PaginationBtn
            onClick={() => goTo(page - 1)}
            disabled={!canPrev}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </PaginationBtn>

          {/* Page numbers */}
          <div className="flex items-center gap-0.5 mx-1">
            {pageNumbers.map((p, i) =>
              p === '...' ? (
                <span
                  key={`ellipsis-${i}`}
                  className="flex h-7 w-7 items-center justify-center text-xs text-muted-foreground/50"
                >
                  …
                </span>
              ) : (
                <PaginationBtn
                  key={p}
                  onClick={() => goTo(p as number)}
                  active={p === page}
                  aria-label={`Page ${p}`}
                >
                  {p}
                </PaginationBtn>
              ),
            )}
          </div>

          {/* Next */}
          <PaginationBtn
            onClick={() => goTo(page + 1)}
            disabled={!canNext}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </PaginationBtn>

          {/* Last */}
          <PaginationBtn
            onClick={() => goTo(totalPages)}
            disabled={!canNext}
            aria-label="Last page"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </PaginationBtn>
        </div>
      )}
    </div>
  );
}

/* ── Page number button ── */

function PaginationBtn({
  children,
  onClick,
  disabled,
  active,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 min-w-7 items-center justify-center rounded-md text-xs font-medium transition-all duration-150',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : disabled
            ? 'text-muted-foreground/30 cursor-not-allowed'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ── Page number generation (Solscan-style) ── */

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | '...')[] = [];

  // Always show first page
  pages.push(1);

  if (current <= 4) {
    // Near start: 1 2 3 4 5 ... N
    for (let i = 2; i <= Math.min(5, total - 1); i++) pages.push(i);
    if (total > 6) pages.push('...');
    pages.push(total);
  } else if (current >= total - 3) {
    // Near end: 1 ... N-4 N-3 N-2 N-1 N
    pages.push('...');
    for (let i = Math.max(total - 4, 2); i <= total; i++) pages.push(i);
  } else {
    // Middle: 1 ... (cur-1) cur (cur+1) ... N
    pages.push('...');
    pages.push(current - 1);
    pages.push(current);
    pages.push(current + 1);
    pages.push('...');
    pages.push(total);
  }

  return pages;
}

/* ── usePagination hook ── */

export function usePagination(total: number, initialPerPage = 25) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPageState] = useState(initialPerPage);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const setPerPage = useCallback(
    (pp: number) => {
      setPerPageState(pp);
      setPage(1); // reset to first page on per-page change
    },
    [],
  );

  const paginate = useCallback(
    <T,>(items: T[]): T[] => {
      const start = (page - 1) * perPage;
      return items.slice(start, start + perPage);
    },
    [page, perPage],
  );

  // Reset page if it exceeds total pages
  const safePage = page > totalPages ? 1 : page;
  if (safePage !== page) setPage(safePage);

  return { page: safePage, perPage, totalPages, setPage, setPerPage, paginate };
}
