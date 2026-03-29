'use client';

/**
 * Stub Mermaid component – renders chart source as a code block.
 * Install the `mermaid` npm package and uncomment the real implementation to enable
 * client-side rendering of Mermaid diagrams.
 */
export function Mermaid({ chart }: { chart: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-fd-secondary p-4 text-sm">
      <code>{chart}</code>
    </pre>
  );
}