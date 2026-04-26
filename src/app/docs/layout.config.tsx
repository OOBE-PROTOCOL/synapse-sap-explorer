import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/**
 * Shared layout configurations for docs.
 * Applied to both the docs sidebar and top navigation bar.
 */
export const baseOptions: BaseLayoutProps = {
  nav: {
    url: "/",
    title: (
      <div className="flex items-center gap-2 text-fd-muted-foreground transition-colors hover:text-fd-foreground">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span className="font-semibold text-sm tracking-tight" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>SAP DOC</span>
        <span className="text-xs font-mono text-fd-muted-foreground/60 bg-fd-muted px-1.5 py-0.5 rounded">v0.9.3</span>
      </div>
    ),
    transparentMode: "top",
  },
  // Navbar links are intentionally limited to external destinations only.
  // CLI / SDK / Core / Examples / Skills are already first-class folders
  // in the sidebar page tree — duplicating them here caused them to render
  // twice on narrow viewports (once in the navbar mirror, once in the tree).
  links: [
    {
      text: "GitHub",
      url: "https://github.com/OOBE-PROTOCOL",
      external: true,
    },
  ],
};
