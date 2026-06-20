"use client"

import Link from "next/link"
import { TrendingUp } from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Rectangle,
  XAxis,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart"
import { cn } from "~/lib/utils"

type AreaSeries = {
  key: string
  label: string
  color?: string
}

type LegendItem = {
  label: string
  href?: string
  value?: string
  color?: string
}

type ChartAreaGradientProps<TData extends Record<string, unknown>> = {
  title: string
  description?: string
  data: TData[]
  xKey: keyof TData & string
  series: AreaSeries[]
  legend?: LegendItem[]
  footer?: string
  height?: number
  className?: string
  contentClassName?: string
  tickFormatter?: (value: string) => string
  valueFormatter?: (value: unknown, name: unknown) => React.ReactNode
  legendLayout?: "chips" | "panel"
}

export function ChartAreaGradient<TData extends Record<string, unknown>>({
  title,
  description,
  data,
  xKey,
  series,
  legend,
  footer,
  height = 260,
  className,
  contentClassName,
  tickFormatter,
  valueFormatter,
  legendLayout = "chips",
}: ChartAreaGradientProps<TData>) {
  const chartConfig = series.reduce<ChartConfig>((acc, item, index) => {
    acc[item.key] = {
      label: item.label,
      color: item.color ?? `hsl(var(--chart-${(index % 5) + 1}))`,
    }
    return acc
  }, {})

  return (
    <Card className={cn("min-w-0 overflow-hidden", className)}>
      <CardHeader className="gap-1 pb-0 px-4 pt-4 sm:px-6 sm:pt-6">
        <CardTitle className="min-w-0 truncate text-sm sm:text-base">
          {title}
        </CardTitle>

        {description && (
          <CardDescription className="line-clamp-2 text-xs sm:text-sm">
            {description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent
        className={cn(
          "min-w-0 pb-0 px-3 sm:px-6",
          legendLayout === "panel" &&
            "grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]",
          contentClassName,
        )}
      >
        <div className="min-w-0 overflow-hidden">
          <ChartContainer
            config={chartConfig}
            className="h-[var(--chart-height-mobile)] w-full sm:h-[var(--chart-height)]"
            style={
              {
                "--chart-height-mobile": `${Math.min(height, 260)}px`,
                "--chart-height": `${height}px`,
              } as React.CSSProperties
            }
          >
            <AreaChart
              accessibilityLayer
              data={data}
              margin={{
                left: 4,
                right: 4,
                top: 12,
                bottom: 0,
              }}
            >
              <CartesianGrid vertical={false} />

              <XAxis
                dataKey={xKey as never}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(value) =>
                  tickFormatter?.(String(value)) ?? String(value).slice(0, 8)
                }
              />

              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, name, item) => {
                      const key = String(item.dataKey ?? name)
                      const label = chartConfig[key]?.label ?? String(name)

                      return (
                        <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:min-w-44">
                          <span className="min-w-0 truncate text-muted-foreground">
                            {label}
                          </span>

                          <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-foreground sm:text-sm">
                            {valueFormatter?.(value, label) ??
                              Number(value ?? 0).toLocaleString()}
                          </span>
                        </div>
                      )
                    }}
                  />
                }
              />

              <defs>
                {series.map((item) => (
                  <linearGradient
                    key={item.key}
                    id={`fill-${item.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={`var(--color-${item.key})`}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={`var(--color-${item.key})`}
                      stopOpacity={0.08}
                    />
                  </linearGradient>
                ))}
              </defs>

              {series.map((item) => (
                <Area
                  key={item.key}
                  dataKey={item.key}
                  type="natural"
                  fill={`url(#fill-${item.key})`}
                  fillOpacity={series.length > 2 ? 0.12 : 0.42}
                  stroke={`var(--color-${item.key})`}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        </div>

        {legendLayout === "panel" && legend?.length ? (
          <div className="min-w-0 rounded-xl border bg-background p-3">
            <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Top agents
              </p>

              {footer && (
                <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground sm:text-xs">
                  {footer}
                </span>
              )}
            </div>

            <div className="flex max-h-[220px] flex-col gap-1 overflow-y-auto pr-1 xl:max-h-none xl:overflow-visible xl:pr-0">
              {legend.map((item, index) => (
                <Link
                  key={`${item.label}-${index}`}
                  href={item.href ?? "#"}
                  className="group flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs transition-colors hover:bg-accent"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full bg-[--legend-color]"
                      style={
                        {
                          "--legend-color":
                            item.color ??
                            `hsl(var(--chart-${(index % 5) + 1}))`,
                        } as React.CSSProperties
                      }
                    />

                    <span className="min-w-0 truncate font-medium text-foreground group-hover:text-primary">
                      {item.label}
                    </span>
                  </span>

                  {item.value && (
                    <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground sm:text-xs">
                      {item.value}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>

      {legendLayout === "chips" && (legend?.length || footer) && (
        <CardFooter className="flex-col items-start gap-3 px-4 pt-4 text-sm sm:px-6">
          {legend?.length ? (
            <div className="flex w-full min-w-0 flex-wrap gap-2">
              {legend.map((item, index) => {
                const body = (
                  <>
                    <span
                      className="size-2 shrink-0 rounded-full bg-[--legend-color]"
                      style={
                        {
                          "--legend-color":
                            item.color ??
                            `hsl(var(--chart-${(index % 5) + 1}))`,
                        } as React.CSSProperties
                      }
                    />

                    <span className="min-w-0 truncate">{item.label}</span>

                    {item.value && (
                      <span className="shrink-0 font-mono text-muted-foreground">
                        {item.value}
                      </span>
                    )}
                  </>
                )

                return item.href ? (
                  <Link
                    key={`${item.label}-${index}`}
                    href={item.href}
                    className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {body}
                  </Link>
                ) : (
                  <span
                    key={`${item.label}-${index}`}
                    className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground"
                  >
                    {body}
                  </span>
                )
              })}
            </div>
          ) : null}

          {footer && (
            <div className="flex min-w-0 items-center gap-2 text-xs leading-none font-medium sm:text-sm">
              <TrendingUp data-icon="inline-start" />
              <span className="truncate">{footer}</span>
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  )
}

type ChartCompositionDatum = {
  name: string
  value: number
  display: string
  detail?: string
  fill: string
}

export function ChartVolumeComposition({
  title,
  description,
  data,
  footer,
  height = 250,
}: {
  title: string
  description?: string
  data: ChartCompositionDatum[]
  footer?: React.ReactNode
  height?: number
}) {
  const chartConfig = data.reduce<ChartConfig>((acc, item, index) => {
    acc[item.name.toLowerCase()] = {
      label: item.name,
      color: item.fill || `hsl(var(--chart-${(index % 5) + 1}))`,
    }
    return acc
  }, {})

  const total = data.reduce((sum, item) => sum + Math.max(item.value, 0), 0)

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="gap-1 px-4 pt-4 pb-0 sm:px-6 sm:pt-6">
        <CardTitle className="min-w-0 truncate text-sm sm:text-base">
          {title}
        </CardTitle>

        {description && (
          <CardDescription className="line-clamp-2 text-xs sm:text-sm">
            {description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="grid min-w-0 gap-4 px-4 pb-4 pt-4 sm:px-6 xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-5">
        <div className="min-w-0 overflow-hidden">
          <ChartContainer
            config={chartConfig}
            className="mx-auto h-[var(--chart-height-mobile)] w-full max-w-[260px] sm:h-[var(--chart-height)] sm:max-w-[320px]"
            style={
              {
                "--chart-height-mobile": `${Math.min(height, 220)}px`,
                "--chart-height": `${height}px`,
              } as React.CSSProperties
            }
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, _name, item) => {
                      const payload =
                        item.payload as ChartCompositionDatum | undefined

                      return (
                        <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:min-w-44">
                          <span className="min-w-0 truncate text-muted-foreground">
                            {payload?.name ?? "Value"}
                          </span>

                          <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-foreground sm:text-sm">
                            {payload?.display ??
                              Number(value ?? 0).toLocaleString()}
                          </span>
                        </div>
                      )
                    }}
                  />
                }
              />

              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="48%"
                outerRadius="80%"
                paddingAngle={3}
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={
                      entry.fill ||
                      `hsl(var(--chart-${(index % 5) + 1}))`
                    }
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-3">
          {data.map((item, index) => {
            const pct =
              total > 0 ? (Math.max(0, item.value) / total) * 100 : 0

            const color =
              item.fill || `hsl(var(--chart-${(index % 5) + 1}))`

            return (
              <div
                key={item.name}
                className="min-w-0 rounded-xl border bg-background p-3"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex min-w-0 max-w-90 items-center gap-2 text-sm font-semibold">
                      <span
                        className="size-2 shrink-0 rounded-full bg-[--metric-color]"
                        style={
                          {
                            "--metric-color": color,
                          } as React.CSSProperties
                        }
                      />

                      <span className="min-w-0 truncate">
                        {item.name}
                      </span>
                    </p>

                    {item.detail && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.detail}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-mono text-xs font-semibold tabular-nums sm:text-sm">
                      {item.display}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {pct.toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[--metric-color]"
                    style={
                      {
                        width: `${Math.min(pct, 100)}%`,
                        "--metric-color": color,
                      } as React.CSSProperties
                    }
                  />
                </div>
              </div>
            )
          })}

          {footer && (
            <div className="min-w-0 text-xs text-muted-foreground sm:text-sm">
              {footer}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

type ChartBarActiveProps = {
  title: string
  description?: string
  data: Array<{
    name: string
    value: number
    display?: string
    fill: string
  }>
  activeIndex?: number
  footer?: string
  height?: number
  className?: string
}

type ActiveBarShapeProps = React.ComponentProps<typeof Rectangle> & {
  index?: number
  payload?: { fill?: string }
}

export function ChartBarActive({
  title,
  description,
  data,
  activeIndex = 1,
  footer,
  height = 190,
  className,
}: ChartBarActiveProps) {
  const chartConfig = {
    value: {
      label: "Value",
    },
    deposited: {
      label: "Deposited",
      color: "hsl(var(--chart-1))",
    },
    settled: {
      label: "Settled",
      color: "hsl(var(--chart-2))",
    },
    locked: {
      label: "Locked",
      color: "hsl(var(--chart-3))",
    },
  } satisfies ChartConfig

  const chartData = data.map((row, index) => ({
    ...row,
    key: row.name.toLowerCase(),
    fill: row.fill || `var(--color-${index === 0 ? "deposited" : index === 1 ? "settled" : "locked"})`,
  }))

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="gap-1 pb-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="pb-0">
        <ChartContainer config={chartConfig} className="h-[var(--chart-height)] w-full" style={{ "--chart-height": `${height}px` } as React.CSSProperties}>
          <BarChart accessibilityLayer data={chartData} margin={{ left: 8, right: 8, top: 14 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, _name, item) => {
                    const payload = item.payload as { name?: string; display?: string } | undefined
                    return (
                      <div className="flex w-full min-w-40 items-center justify-between gap-3">
                        <span className="text-muted-foreground">{payload?.name ?? "Value"}</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {payload?.display ?? Number(value ?? 0).toLocaleString()}
                        </span>
                      </div>
                    )
                  }}
                />
              }
            />
            <Bar
              dataKey="value"
              strokeWidth={2}
              radius={8}
              maxBarSize={96}
              shape={(props: ActiveBarShapeProps) =>
                Number(props.index) === activeIndex ? (
                  <Rectangle
                    {...props}
                    fillOpacity={0.82}
                    stroke={props.payload?.fill}
                    strokeDasharray={4}
                    strokeDashoffset={4}
                  />
                ) : (
                  <Rectangle {...props} />
                )
              }
            >
              {chartData.map((row) => (
                <Cell key={row.name} fill={row.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
      {footer && (
        <CardFooter className="pt-4 text-sm">
          <div className="flex gap-2 leading-none font-medium">
            <TrendingUp data-icon="inline-start" />
            {footer}
          </div>
        </CardFooter>
      )}
    </Card>
  )
}
