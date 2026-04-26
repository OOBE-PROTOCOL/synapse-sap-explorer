import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import Link from "next/link";
import { baseOptions } from "@/app/docs/layout.config";
import { source } from "@/lib/source";
import { BackToExplorer } from "@/components/docs/BackToHome";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      {...baseOptions}
      sidebar={{
        collapsible: true,
        defaultOpenLevel: 1,
        // Per-breakpoint sidebar width. fumadocs reads --fd-sidebar-width
        // for layout calculations; we override its defaults so the sidebar
        // is comfortable on large displays without crowding content.
        className:
          "[--fd-sidebar-width:260px] md:[--fd-sidebar-width:280px] lg:[--fd-sidebar-width:300px] xl:[--fd-sidebar-width:320px] max-w-[82vw]",
        banner: (
          <div className="flex flex-col gap-3 pb-1">
            <Link
              href="/docs/sdk/quickstart"
              className="group flex items-center gap-2 rounded-md bg-fd-primary/10 px-3 py-2 text-[0.75rem] font-semibold text-fd-primary transition-colors hover:bg-fd-primary/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              Get Started
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ml-auto shrink-0 transition-transform group-hover:translate-x-0.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          </div>
        ),
        footer: <BackToExplorer />,
      }}
    >
      {children}
    </DocsLayout>
  );
}
