"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ActivityList } from "@/components/activity-list";
import { type Point, TimeSeriesChart } from "@/components/charts/time-series";
import { LiveStatus } from "@/components/live-status";
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
  formatUSD,
} from "@/lib/format";
import { useLiveFeed } from "@/lib/hooks/live-feed";
import {
  useDays,
  useEvents,
  useProtocol,
  useRewardProgress,
} from "@/lib/hooks/queries";
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
    <Card className="flex h-full flex-col">
      <div className="flex flex-1 items-center gap-5 p-5 sm:p-6">
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
      </div>
      <RewardCalls round={protocol.currentRound} />
    </Card>
  );
}

function RoundCardSkeleton() {
  return (
    <Card className="flex h-full flex-col">
      <div className="flex flex-1 items-center gap-5 p-5 sm:p-6">
        <Skeleton className="size-28 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="border-t border-hairline px-5 py-3.5 sm:px-6">
        <Skeleton className="h-3.5 w-full" />
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
        label="Participation"
        value={formatPercent(protocol.participationRate, { decimals: 2 })}
        sub={`${formatLPT(protocol.totalActiveStake, {
          compact: true,
        })} staked · target ${formatPercent(protocol.targetBondingRate, {
          decimals: 0,
        })}`}
      />
      <Kpi
        label="Inflation per round"
        value={formatPercent(protocol.inflation / 1e7, { decimals: 4 })}
        sub={
          // The minter nudges inflation toward the target bonding rate:
          // up while participation is below it, down while above.
          protocol.participationRate < protocol.targetBondingRate
            ? "Rising: participation is below target"
            : "Falling: participation is above target"
        }
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

/* ── Reward calls this round ─────────────────────────────────────────────── */

/**
 * How many active orchestrators have called reward in the current round.
 * It fills through every round and resets at the next, so the page always
 * shows the protocol moving; a laggard late in a round is worth knowing.
 */
/** Footer of the round card: who has called reward so far this round. */
function RewardCalls({ round }: { round: number }) {
  const { data } = useRewardProgress(round);
  const pct = data && data.total > 0 ? (data.called / data.total) * 100 : 0;
  const left = data ? data.total - data.called : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline px-5 py-3.5 sm:px-6">
      <span className="text-ui-caption text-muted-foreground">
        Reward calls
      </span>
      <span className="font-mono text-[13px] tabular-nums">
        {data ? (
          <>
            {data.called}
            <span className="text-muted-foreground">/{data.total}</span>
          </>
        ) : (
          <Skeleton className="h-3.5 w-12" />
        )}
      </span>
      <div
        role="progressbar"
        aria-label="Orchestrators that have called reward this round"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]"
      >
        <div
          className="h-full rounded-full bg-green-bright transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {data && (
        <span className="basis-full text-ui-caption text-muted-foreground sm:basis-auto">
          {left > 0 ? `${left} to go · ` : "All called · "}
          <span className="font-mono text-foreground tabular-nums">
            {formatLPT(data.minted, { compact: true })}
          </span>{" "}
          minted
        </span>
      )}
    </div>
  );
}

/* ── Latest activity ─────────────────────────────────────────────────────── */

function LatestActivity() {
  const { data, isLoading, error, dataUpdatedAt } = useEvents(200);
  const latest = useMemo(() => data?.slice(0, 8), [data]);
  // The feed sits below the fold, so never hold arrivals back for scrolling.
  const { shown, fresh } = useLiveFeed(latest, { holdBelow: Infinity });
  return (
    <Section>
      <SectionHeader
        title="Latest activity"
        description="Fees earned, delegations, reward calls and votes, as they're indexed"
        action={
          <>
            <LiveStatus updatedAt={dataUpdatedAt} failing={Boolean(error)} />
            <Link
              href="/activity"
              className="ml-2 inline-flex items-center gap-1 text-ui-caption text-muted-foreground hover:text-foreground"
            >
              View all <ArrowRight className="size-3" />
            </Link>
          </>
        }
      />
      <ActivityList
        events={shown}
        loading={isLoading || !shown}
        fresh={fresh}
      />
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

      <LatestActivity />
    </Page>
  );
}
