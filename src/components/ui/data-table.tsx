'use client';

import { useRef, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type OnChangeFn,
  type Row,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { Card, CardContent } from '~/components/ui/card';
import { cn } from '~/lib/utils';

/* ═══════════════════════════════════════════════════════════
 * Types
 * ═══════════════════════════════════════════════════════════ */

export type DataTableProps<TData> = {
  /** Column definitions (TanStack Table). */
  columns: ColumnDef<TData, unknown>[];
  /** Data rows. */
  data: TData[];
  /** Global filter value (free text search). */
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  /** Controlled sorting state. */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  /** Controlled column filters. */
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  /** Enable virtualization for large lists (default: auto > 100 rows). */
  virtualize?: boolean;
  /** Virtual row height in px (default: 44). */
  rowHeight?: number;
  /** Max height for virtual scroll container (default: 600). */
  maxHeight?: number;
  /** Custom row key getter. */
  getRowId?: (row: TData, index: number) => string;
  /** Show row count badge. */
  rowCount?: number;
  /** Wrap in Card container (default: true). */
  card?: boolean;
  /** Extra className on the outer container. */
  className?: string;
  /** Render function for empty state. */
  emptyState?: ReactNode;
  /** Header row classnames */
  headerClassName?: string;
  /** Body row classnames */
  rowClassName?: string | ((row: Row<TData>) => string);
  /** Click handler per row */
  onRowClick?: (row: TData) => void;
};

/* ═══════════════════════════════════════════════════════════
 * SortIcon helper
 * ═══════════════════════════════════════════════════════════ */

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') return <ChevronUp className="h-3 w-3 ml-1 inline-block" />;
  if (sorted === 'desc') return <ChevronDown className="h-3 w-3 ml-1 inline-block" />;
  return <ArrowUpDown className="h-3 w-3 ml-1 inline-block opacity-30" />;
}

/* ═══════════════════════════════════════════════════════════
 * VirtualRows — renders only visible rows
 * ═══════════════════════════════════════════════════════════ */

function VirtualRows<TData>({
  table,
  rowHeight,
  maxHeight,
  rowClassName,
  onRowClick,
}: {
  table: ReturnType<typeof useReactTable<TData>>;
  rowHeight: number;
  maxHeight: number;
  rowClassName?: string | ((row: Row<TData>) => string);
  onRowClick?: (row: TData) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { rows } = table.getRowModel();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 15,
  });

  return (
    <div
      ref={parentRef}
      className="overflow-auto"
      style={{ maxHeight }}
    >
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="border-border/30">
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'text-micro uppercase tracking-wider',
                    header.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground transition-colors',
                  )}
                  onClick={header.column.getToggleSortingHandler()}
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                >
                  <div className="flex items-center">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && <SortIcon sorted={header.column.getIsSorted()} />}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {/* Spacer before visible items */}
          {virtualizer.getVirtualItems().length > 0 && (
            <tr style={{ height: virtualizer.getVirtualItems()[0]?.start ?? 0 }}>
              <td colSpan={table.getAllColumns().length} />
            </tr>
          )}

          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index]!;
            const cls = typeof rowClassName === 'function' ? rowClassName(row) : rowClassName;
            return (
              <TableRow
                key={row.id}
                data-index={vi.index}
                className={cn(
                  'hover:bg-muted/30 border-border/30 transition-colors',
                  onRowClick && 'cursor-pointer',
                  cls,
                )}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                style={{ height: rowHeight }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}

          {/* Spacer after visible items */}
          {virtualizer.getVirtualItems().length > 0 && (
            <tr
              style={{
                height:
                  virtualizer.getTotalSize() -
                  (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
              }}
            >
              <td colSpan={table.getAllColumns().length} />
            </tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * PlainRows — simple render for small datasets
 * ═══════════════════════════════════════════════════════════ */

function PlainRows<TData>({
  table,
  rowClassName,
  onRowClick,
}: {
  table: ReturnType<typeof useReactTable<TData>>;
  rowClassName?: string | ((row: Row<TData>) => string);
  onRowClick?: (row: TData) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="border-border/30 bg-muted/20">
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'text-micro uppercase tracking-wider',
                    header.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground transition-colors',
                  )}
                  onClick={header.column.getToggleSortingHandler()}
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                >
                  <div className="flex items-center">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && <SortIcon sorted={header.column.getIsSorted()} />}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const cls = typeof rowClassName === 'function' ? rowClassName(row) : rowClassName;
            return (
              <TableRow
                key={row.id}
                className={cn(
                  'hover:bg-muted/30 border-border/30 transition-colors',
                  onRowClick && 'cursor-pointer',
                  cls,
                )}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * DataTable
 * ═══════════════════════════════════════════════════════════ */

export function DataTable<TData>({
  columns,
  data,
  globalFilter,
  onGlobalFilterChange,
  sorting,
  onSortingChange,
  columnFilters,
  onColumnFiltersChange,
  virtualize,
  rowHeight = 44,
  maxHeight = 600,
  getRowId,
  card = true,
  className,
  emptyState,
  rowClassName,
  onRowClick,
}: DataTableProps<TData>) {
  const shouldVirtualize = virtualize ?? data.length > 100;

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sorting ?? [],
      globalFilter: globalFilter ?? '',
      columnFilters: columnFilters ?? [],
    },
    onSortingChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId,
    enableSortingRemoval: true,
  });

  const rowCount = table.getFilteredRowModel().rows.length;

  if (rowCount === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const content = shouldVirtualize ? (
    <VirtualRows
      table={table}
      rowHeight={rowHeight}
      maxHeight={maxHeight}
      rowClassName={rowClassName}
      onRowClick={onRowClick}
    />
  ) : (
    <PlainRows table={table} rowClassName={rowClassName} onRowClick={onRowClick} />
  );

  if (!card) return <div className={className}>{content}</div>;

  return (
    <Card className={cn('overflow-hidden hud-border', className)}>
      <CardContent className="p-0">
        {content}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
 * DataTablePagination — shared cursor/offset pagination bar
 * ═══════════════════════════════════════════════════════════ */

export type DataTablePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function DataTablePagination({ page, pageSize, total, onPageChange }: DataTablePaginationProps) {
  if (total <= pageSize) return null;

  const maxPage = Math.ceil(total / pageSize) - 1;

  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span className="tabular-nums">
        Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total.toLocaleString()}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 rounded-lg text-micro font-medium border transition-all duration-200 border-border/40 bg-background hover:bg-muted/50 hover:border-border/60 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        <button
          onClick={() => onPageChange(Math.min(maxPage, page + 1))}
          disabled={page >= maxPage}
          className="px-3 py-1.5 rounded-lg text-micro font-medium border transition-all duration-200 border-border/40 bg-background hover:bg-muted/50 hover:border-border/60 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
