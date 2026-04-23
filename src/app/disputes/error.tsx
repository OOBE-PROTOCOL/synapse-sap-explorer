'use client';

import { Swords } from 'lucide-react';

export default function DisputesError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
        <Swords className="h-6 w-6 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold">Failed to load disputes</h2>
      <p className="text-sm text-muted-foreground max-w-md">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
