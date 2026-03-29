import "./global.css";
import { RootProvider } from "fumadocs-ui/provider";
import type { ReactNode } from "react";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider>
      {/* Load fumadocs-ui CSS statically (bypasses TW3 PostCSS) */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/fumadocs-ui.css" />
      {children}
    </RootProvider>
  );
}
