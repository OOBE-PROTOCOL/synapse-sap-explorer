import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { baseOptions } from "@/app/docs/layout.config";
import { source } from "@/lib/source";
import { BackToExplorer } from "@/components/docs/BackToHome";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      {...baseOptions}
      sidebar={{
        defaultOpenLevel: 1,
        banner: (
          <div className="rounded-lg border border-fd-border/50 bg-fd-accent/30 px-3 py-2 text-fd-muted-foreground text-xs leading-relaxed">
            <span className="font-semibold text-fd-foreground">OOBE Protocol</span>{" "}
            Documentation
          </div>
        ),
        footer: <BackToExplorer />,
      }}
    >
      {children}
    </DocsLayout>
  );
}
