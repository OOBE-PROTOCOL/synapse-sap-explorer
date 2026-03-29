import Link from 'next/link';

/**
 * Sidebar-footer link back to the Explorer app.
 * Renders as a subtle, accessible button with keyboard focus ring.
 */
export function BackToExplorer() {
  return (
    <Link
      href="/"
      aria-label="Back to Synapse Explorer"
      className="group flex w-full items-center gap-2.5 rounded-lg border border-fd-border/60 bg-fd-card/50 px-3 py-2 text-[0.8125rem] font-medium text-fd-muted-foreground transition-all hover:border-fd-primary/30 hover:bg-fd-accent/60 hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background"
    >
      {/* Animated arrow */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5"
      >
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
      <span>Back to Explorer</span>
    </Link>
  );
}
