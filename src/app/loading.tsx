import { Loader2 } from 'lucide-react';

export default function GlobalLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
        <div className="absolute inset-0 h-8 w-8 animate-glow-pulse rounded-full" />
      </div>
      <p className="text-sm text-muted-foreground/60 tracking-wider uppercase text-[10px] font-semibold">Loading…</p>
      <div className="h-px w-20 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
    </div>
  );
}
