import type { ReactNode } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Progress } from '~/components/ui/progress';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';

type VolumeMetricCardProps = {
  icon: ReactNode;
  label?: string;
  value: string | number | null | undefined;
  fiatValue?: string | null;
  calls?: string | number | null;
  utilization?: number | null;
  loading?: boolean;
  className?: string;
  descriptor?: string;
};

function normalizePercent(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(Number(value), 100));
}

export function VolumeMetricCard({
  icon,
  label = 'Volume',
  value,
  fiatValue,
  calls,
  utilization,
  loading,
  className,
  descriptor = 'settled calls',
}: VolumeMetricCardProps) {
  const util = normalizePercent(utilization);
  const hasValue = value !== null && value !== undefined && String(value).trim() !== '' && String(value) !== '—';
  const callText = calls !== null && calls !== undefined && String(calls).trim() !== ''
    ? `${calls} ${descriptor}`
    : null;

  return (
    <Card className={cn('group overflow-hidden border bg-card shadow-sm transition-colors duration-200 hover:border-primary/25', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-0">
        <div className="flex min-w-0 flex-col gap-1">
          <CardDescription className="text-xs font-medium">{label}</CardDescription>
          <CardTitle className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-2xl tabular-nums">
            {loading || !hasValue ? <Skeleton className="h-8 w-32" /> : <span className="truncate">{value}</span>}
            {fiatValue && !loading ? (
              <span className="text-sm font-medium text-muted-foreground">{fiatValue}</span>
            ) : null}
          </CardTitle>
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          {icon}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-4 pt-3">
        {callText ? (
          <p className="text-xs text-muted-foreground">{callText}</p>
        ) : (
          <p className="text-xs text-muted-foreground">No settled calls indexed yet</p>
        )}
        {util !== null ? (
          <Progress value={util} aria-label={`${label} utilization ${util.toFixed(1)}%`} className="h-1.5" />
        ) : null}
      </CardContent>

      {/*util !== null ? (
        <CardFooter className="p-4 pt-0">
          <Badge variant="secondary" className="font-mono tabular-nums">
            ↑ {util.toFixed(1)}% util
          </Badge>
        </CardFooter>
      ) : null*/}
    </Card>
  );
}
