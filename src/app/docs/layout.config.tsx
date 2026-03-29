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
        <span className="font-semibold text-sm">SAP Explorer Docs</span>
      </div>
    ),
    transparentMode: "top",
  },
  links: [
    {
      text: "SDK",
      url: "/docs/sdk/overview",
    },
    {
      text: "SAP",
      url: "/docs/sap/overview",
    },
    {
      text: "AI Gateway",
      url: "/docs/ai-gateway/overview",
    },
    {
      text: "GitHub",
      url: "https://github.com/OOBE-PROTOCOL",
      external: true,
    },
  ],
};
