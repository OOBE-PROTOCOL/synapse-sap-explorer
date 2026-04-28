/**
 * Boundary skeleton for the /docs segment.
 * Shown the moment a user clicks a /docs link from the app shell,
 * before fumadocs renders its own layout. Keeps the transition under 16ms perceived.
 */
export default function DocsBoundaryLoading() {
  return (
    <div className="flex min-h-dvh w-full bg-fd-background">
      <aside className="hidden w-64 border-r border-fd-border/50 p-4 md:block">
        <div className="space-y-3">
          <div className="h-8 w-full animate-pulse rounded bg-fd-muted/40" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-fd-muted/30" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-fd-muted/30" />
          <div className="mt-6 h-4 w-1/2 animate-pulse rounded bg-fd-muted/30" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-fd-muted/30" />
        </div>
      </aside>
      <main className="flex-1 px-6 py-10 lg:px-12">
        <div className="space-y-6 animate-pulse">
          <div className="h-9 w-2/3 rounded bg-fd-muted/60" />
          <div className="h-5 w-1/2 rounded bg-fd-muted/40" />
          <div className="h-4 w-full rounded bg-fd-muted/30" />
          <div className="h-4 w-11/12 rounded bg-fd-muted/30" />
        </div>
      </main>
    </div>
  );
}
