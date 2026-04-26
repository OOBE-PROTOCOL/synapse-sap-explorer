import "./global.css";
import { RootProvider } from "fumadocs-ui/provider";
import type { ReactNode } from "react";
import { DocsRouteMarker } from "~/components/docs/DocsRouteMarker";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider>
      <DocsRouteMarker />
      {/* Load fumadocs-ui CSS statically (bypasses TW3 PostCSS) */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/fumadocs-ui.css" />
      <div className="fd-docs-root">{children}</div>
    </RootProvider>
  );
}
