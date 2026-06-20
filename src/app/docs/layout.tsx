import { RootProvider } from 'fumadocs-ui/provider';
import { DocsRouteMarker } from '~/components/docs/DocsRouteMarker';
import type { ReactNode } from 'react';
import './global.css';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      theme={{
        enabled: true,
        defaultTheme: 'dark',
      }}
    >
      <DocsRouteMarker />
      {children}
    </RootProvider>
  );
}
