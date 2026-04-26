/**
 * Instant loading skeleton for docs pages.
 * Renders synchronously while the MDX route segment streams.
 * Matches the fumadocs DocsLayout so the transition feels free.
 */
export default function DocsLoading() {
  return (
    <div className="flex min-h-[60vh] w-full animate-pulse flex-col gap-6 px-6 py-10 lg:px-12">
      <div className="h-3 w-24 rounded-full bg-fd-muted/60" />
      <div className="h-9 w-2/3 rounded-md bg-fd-muted/70" />
      <div className="h-5 w-1/2 rounded-md bg-fd-muted/40" />
      <div className="mt-4 space-y-3">
        <div className="h-4 w-full rounded bg-fd-muted/30" />
        <div className="h-4 w-11/12 rounded bg-fd-muted/30" />
        <div className="h-4 w-9/12 rounded bg-fd-muted/30" />
        <div className="h-4 w-10/12 rounded bg-fd-muted/30" />
      </div>
      <div className="mt-6 h-40 w-full rounded-xl bg-fd-muted/20" />
    </div>
  );
}
