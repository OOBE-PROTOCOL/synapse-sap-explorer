'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '~/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-destructive/10 ring-1 ring-destructive/20 shadow-[0_0_25px_-4px_hsl(var(--destructive)/0.3)]">
        <AlertTriangle className="h-8 w-8 text-destructive drop-shadow-[0_0_8px_hsl(var(--destructive)/0.4)]" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="max-w-md text-sm text-muted-foreground/80">
          {error.message || 'An unexpected error occurred while loading this page.'}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/50 font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <div className="h-px w-32 bg-gradient-to-r from-transparent via-destructive/30 to-transparent" />
      <Button variant="outline" onClick={reset} className="gap-2 border-border/40 hover:border-primary/30 hover:shadow-[0_0_12px_-3px_hsl(var(--glow)/0.2)] transition-all duration-300">
        <RefreshCw className="h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
