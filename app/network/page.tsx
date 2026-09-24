"use client";

import { useMemo, useState } from "react";

import { type Point, TimeSeriesChart } from "@/components/charts/time-series";
import {
  Card,
  ErrorNotice,
  Kpi,
  KpiStrip,
  Page,
  PageHeader,
  Section,
  SectionHeader,
} from "@/components/page";
import { Ring, roundState, useNow } from "@/components/shell/round-clock";
import { Segmented, Skeleton, StatusDot } from "@/components/ui/misc";
import {
  formatDate,
  formatDuration,
  formatETH,
  formatLPT,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatUSD,
} from "@/lib/format";
import { useDays, useProtocol } from "@/lib/hooks/queries";
import type { Day, Protocol } from "@/lib/subgraph/network";

/* ── Round ───────────────────────────────────────────────────────────────── */

function RoundCard({ protocol }: { protocol: Protocol }) {
  const now = useNow(1000);
  const s = roundState(protocol, now);
  const next = protocol.currentRound + 1;
  const endsAt = new Date(s.endsAt).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Card className="flex h-full items-center gap-5 p-5 sm:p-6">
      <Ring
        progress={s.progress}
        size={112}
        stroke={9}
        tone={s.overdue || !s.initialized ? "warning" : "positive"}
      >
        <span className="text-[22px] leading-7 font-medium tracking-[-0.01em]">
          {Math.floor(s.progress * 100)}%
        </span>
        <span className="text-[11px] text-muted-foreground">elapsed</span>
      </Ring>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="text-ui-caption text-muted-foreground">
          Current round
        </div>
        <div className="text-[22px] leading-7 font-medium tracking-[-0.01em]">
          {protocol.currentRound.toLocaleString()}
        </div>
        <div className="font-mono text-ui-body text-foreground tabular-nums">
          {s.overdue
            ? "Ready to initialize"
            : `${formatDuration(s.remaining)} left`}
        </div>
        <div className="text-ui-caption text-muted-foreground">
          {s.overdue
            ? `Round ${next.toLocaleString()} can be initialized now`
            : `Round ${next.toLocaleString()} begins around ${endsAt}`}
        </div>
        <div className="text-ui-caption text-muted-foreground">
          <span className="font-mono tabular-nums">
            ~{s.blocksElapsed.toLocaleString()} /{" "}
            {protocol.roundLength.toLocaleString()}
          </span>{" "}
          L1 blocks
        </div>
        <div className="mt-1 flex items-center gap-2 text-ui-caption text-muted-foreground">
          <StatusDot tone={s.initialized ? "positive" : "warning"} />
          {s.initialized ? "Initialized" : "Awaiting initialization"}
        </div>
      </div>
    </Card>
  );
}

function RoundCardSkeleton() {
  return (
    <Card className="flex h-full items-center gap-5 p-5 sm:p-6">
      <Skeleton className="size-28 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-3 w-32" />
      </div>
    </Card>
  );
}

/* ── KPIs ────────────────────────────────────────────────────────────────── */

function NetworkKpis({ protocol }: { protocol?: Protocol }) {
  if (!protocol) {
    return (
      <KpiStrip cols={2} className="h-full">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 px-4 py-4 sm:px-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </KpiStrip>
    );
  }
  return (
    <KpiStrip cols={2} className="h-full">
      <Kpi
        label="Total staked"
        value={formatLPT(protocol.totalActiveStake, { compact: true })}
        sub={`${formatPercent(protocol.participationRate, {
          decimals: 2,
        })} participation`}
      />
      <Kpi
        label="Inflation per round"
        value={formatPercent(protocol.inflation / 1e7, { decimals: 4 })}
        sub={`Target bonding rate ${formatPercent(protocol.targetBondingRate, {
          decimals: 0,
        })}`}
      />
      <Kpi
        label="Fee volume, all time"
        value={formatETH(protocol.totalVolumeETH)}
        sub={
          protocol.totalVolumeUSD > 0
            ? formatUSD(protocol.totalVolumeUSD, { compact: true })
            : "—"
        }
      />
      <Kpi
        label="Delegators"
        value={protocol.delegatorsCount.toLocaleString()}
        sub={`${protocol.activeTranscoderCount.toLocaleString()} active orchestrators`}
      />
    </KpiStrip>
  );
}

/* ── History charts ──────────────────────────────────────────────────────── */

type Metric = "participation" | "fees" | "inflation" | "delegators";
type Range = "3m" | "1y";

const METRICS = [
  { value: "participation", label: "Participation" },
  { value: "fees", label: "Fee volume" },
  { value: "inflation", label: "Inflation" },
  { value: "delegators", label: "Delegators" },
] as const;

const RANGES = [
  { value: "3m", label: "3M" },
  { value: "1y", label: "1Y" },
] as const;

/** Sum daily values into 7-day buckets, anchored on the latest day. A partial
 * leading week is dropped so it doesn't read as a dip. */
function weekly(points: Point[]): Point[] {
  const out: Point[] = [];
  for (let end = points.length; end >= 7; end -= 7) {
    const slice = points.slice(end - 7, end);
    out.push({
      ts: slice[0].ts,
      value: slice.reduce((a, p) => a + p.value, 0),
    });
  }
  return out.reverse();
}

function useChart(days: Day[] | undefined, metric: Metric, range: Range) {
  return useMemo(() => {
    const all = days ?? [];
    const latest = all.length ? all[all.length - 1].date : 0;
    const cutoff = latest - (range === "3m" ? 90 : 365) * 86400;
    const sliced = all.filter((d) => d.date > cutoff);
    const pts = (pick: (d: Day) => number) =>
      sliced.map((d) => ({ ts: d.date, value: pick(d) }));

    switch (metric) {
      case "participation":
        return {
          data: pts((d) => d.participationRate),
          kind: "area" as const,
          color: "var(--series-1)",
          format: (v: number) => formatPercent(v, { decimals: 2 }),
          axis: (v: number) => formatPercent(v, { decimals: 0 }),
          label: "Share of LPT supply staked, daily",
          bucketed: false,
        };
      case "fees": {
        const daily = pts((d) => d.volumeETH);
        const bucketed = daily.length > 90;
        return {
          data: bucketed ? weekly(daily) : daily,
          kind: "bar" as const,
          color: "var(--series-4)",
          format: formatETH,
          axis: (v: number) => formatNumber(v, { decimals: v < 1 ? 2 : 0 }),
          label: bucketed
            ? "ETH fee volume per week"
            : "ETH fee volume per day",
          bucketed,
        };
      }
      case "inflation":
        return {
          data: pts((d) => d.inflation),
          kind: "area" as const,
          color: "var(--series-1)",
          format: (v: number) => formatPercent(v, { decimals: 4 }),
          axis: (v: number) => formatPercent(v, { decimals: 3 }),
          label: "Inflation per round, daily",
          bucketed: false,
        };
      case "delegators":
        return {
          data: pts((d) => d.delegatorsCount),
          kind: "area" as const,
          color: "var(--series-1)",
          format: (v: number) => Math.round(v).toLocaleString(),
          axis: (v: number) => formatNumber(v, { decimals: 0, compact: true }),
          label: "Delegators with stake, daily",
          bucketed: false,
        };
    }
  }, [days, metric, range]);
}

function HistorySection() {
  const [metric, setMetric] = useState<Metric>("participation");
  const [range, setRange] = useState<Range>("1y");
  const { data: days, isLoading, error, refetch } = useDays(365);
  const chart = useChart(days, metric, range);

  return (
    <Section>
      <SectionHeader
        title="History"
        description={chart.label}
        action={
          <Segmented
            label="Time range"
            size="xs"
            value={range}
            onChange={setRange}
            options={RANGES}
          />
        }
      />
      {error ? (
        <ErrorNotice error={error} onRetry={() => refetch()} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto px-4 pt-4 sm:px-5">
            <Segmented
              label="Chart metric"
              value={metric}
              onChange={setMetric}
              options={METRICS}
            />
          </div>
          <div className="px-2 pt-4 pb-3 sm:px-4">
            {isLoading ? (
              <Skeleton className="mx-2 h-[260px]" />
            ) : chart.data.length < 2 ? (
              <div className="flex h-[260px] items-center justify-center text-ui-body text-muted-foreground">
                Not enough history in this range yet.
              </div>
            ) : (
              <TimeSeriesChart
                ariaLabel={chart.label}
                data={chart.data}
                kind={chart.kind}
                color={chart.color}
                format={chart.format}
                axisFormat={chart.axis}
                height={260}
                domain={metric === "fees" ? [0, "auto"] : ["auto", "auto"]}
                tooltipTitle={
                  chart.bucketed
                    ? (p) =>
                        `Week of ${formatDate(p.ts, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}`
                    : undefined
                }
              />
            )}
          </div>
        </Card>
      )}
    </Section>
  );
}

/* ── Recent rounds ───────────────────────────────────────────────────────── */

function RecentRounds({ protocol }: { protocol?: Protocol }) {
  const now = useNow(60_000);
  const rows = protocol
    ? [...protocol.recentRounds].sort((a, b) => b.round - a.round).slice(0, 10)
    : [];

  return (
    <Section>
      <SectionHeader
        title="Recent rounds"
        description="The last ten rounds, newest first"
      />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left">
          <thead>
            <tr className="border-b border-hairline text-ui-caption text-muted-foreground">
              <th className="px-4 py-2.5 font-normal">Round</th>
              <th className="px-4 py-2.5 font-normal">Started</th>
              <th className="px-4 py-2.5 text-right font-normal">Mintable</th>
              <th className="px-4 py-2.5 text-right font-normal">Fee volume</th>
              <th className="px-4 py-2.5 text-right font-normal">New stake</th>
            </tr>
          </thead>
          <tbody>
            {!protocol
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr
                    key={i}
                    className="border-b border-hairline last:border-0"
                  >
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton
                          className={
                            j >= 2 ? "ml-auto h-3.5 w-20" : "h-3.5 w-16"
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((r) => (
                  <tr
                    key={r.round}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="px-4 py-3 font-mono text-[13px] tabular-nums">
                      {r.round.toLocaleString()}
                    </td>
                    <td
                      className="px-4 py-3 text-ui-body text-muted-foreground"
                      title={new Date(r.ts * 1000).toLocaleString()}
                    >
                      {r.ts > 0 ? formatRelativeTime(r.ts, now) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums">
                      <span
                        className={
                          r.mintableTokens > 0
                            ? undefined
                            : "text-muted-foreground"
                        }
                      >
                        {formatLPT(r.mintableTokens)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums">
                      <span
                        className={
                          r.volumeETH > 0 ? undefined : "text-muted-foreground"
                        }
                      >
                        {formatETH(r.volumeETH)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums">
                      <span
                        className={
                          r.newStake > 0 ? undefined : "text-muted-foreground"
                        }
                      >
                        {formatLPT(r.newStake)}
                      </span>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </Card>
    </Section>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function NetworkPage() {
  const { data: protocol, error, refetch } = useProtocol();

  return (
    <Page>
      <PageHeader
        title="Network"
        description="Round progress, stake participation, inflation and fee volume across the Livepeer protocol."
      />

      {error && !protocol ? (
        <ErrorNotice error={error} onRetry={() => refetch()} />
      ) : (
        <Section>
          <SectionHeader title="Round" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {protocol ? (
              <RoundCard protocol={protocol} />
            ) : (
              <RoundCardSkeleton />
            )}
            <NetworkKpis protocol={protocol} />
          </div>
        </Section>
      )}

      <HistorySection />

      {!(error && !protocol) && <RecentRounds protocol={protocol} />}
    </Page>
  );
}
