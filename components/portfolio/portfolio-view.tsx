"use client";

import { useMemo, useState } from "react";

import { ActivityList } from "@/components/activity-list";
import {
  ErrorNotice,
  Kpi,
  KpiStrip,
  Section,
  SectionHeader,
} from "@/components/page";
import { roundState, useNow } from "@/components/shell/round-clock";
import { useStaking } from "@/components/staking/staking";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import {
  formatETH,
  formatLPT,
  formatNumber,
  formatUSD,
  fromWei,
} from "@/lib/format";
import {
  useAccountEvents,
  useOrchestrators,
  useOrchestratorUpdates,
  usePortfolio,
  usePrices,
  useProtocol,
} from "@/lib/hooks/queries";
import type { PortfolioAccount } from "@/lib/hooks/watchlist";
import {
  annualize,
  averageRoundSeconds,
  mergeSeries,
  projectEarnings,
  sumSince,
  trailingRoundRate,
} from "@/lib/portfolio/compute";

import { PortfolioHero } from "./hero";
import { type Position, Positions } from "./positions";
import { ScopeBar } from "./scope-bar";
import {
  type Insight,
  insightOrchestrator,
  Insights,
  PendingWithdrawals,
  Projections,
} from "./side-panels";

export function PortfolioView({
  accounts,
  canManage,
  showScope = true,
}: {
  accounts: PortfolioAccount[];
  canManage: (address: string) => boolean;
  showScope?: boolean;
}) {
  const [scopeRaw, setScope] = useState<string>("all");
  const addresses = useMemo(() => accounts.map((a) => a.address), [accounts]);
  const scope =
    scopeRaw !== "all" && !addresses.includes(scopeRaw) ? "all" : scopeRaw;
  const scoped = useMemo(
    () => (scope === "all" ? addresses : [scope]),
    [scope, addresses]
  );

  const { data, error, isLoading, refetch } = usePortfolio(addresses);
  const { data: protocol } = useProtocol();
  const { data: prices } = usePrices();
  const { data: orchestratorList } = useOrchestrators();
  const now = useNow(5000);
  const nowSec = Math.floor(now / 1000);
  const { open } = useStaking();

  const orchestrators = useMemo(
    () => new Map((orchestratorList ?? []).map((o) => [o.id, o])),
    [orchestratorList]
  );

  const view = useMemo(() => {
    if (!data) return null;
    const accts = data.accounts.filter((a) => scoped.includes(a.id));
    const series =
      scope === "all"
        ? data.series
        : mergeSeries(
            accts.map((a) => a.series),
            data.rounds
          );
    const stake = fromWei(accts.reduce((s, a) => s + a.pendingStake, 0n));
    const fees = fromWei(accts.reduce((s, a) => s + a.pendingFees, 0n));
    const roundSeconds = averageRoundSeconds(data.rounds);
    const rate = trailingRoundRate(series);
    const apr = annualize(rate, roundSeconds);
    const since30 = nowSec - 30 * 86400;
    const rewards30 = sumSince(series, "rewards", since30);
    const fees30 = sumSince(series, "fees", since30);
    const share = series.length ? series[series.length - 1].share : null;
    const lastReward =
      [...series].reverse().find((p) => p.rewards > 0)?.rewards ?? 0;

    const positions: Position[] = accounts
      .filter((a) => scoped.includes(a.address))
      .map((account) => {
        const r = accts.find((x) => x.id === account.address);
        const d = data.delegators.find((x) => x.id === account.address);
        const s = r?.series ?? [];
        return {
          account,
          delegate: r?.delegate ?? null,
          stake: r ? fromWei(r.pendingStake) : 0,
          fees: r ? fromWei(r.pendingFees) : 0,
          rewards30d: sumSince(s, "rewards", since30),
          trend: s.slice(-30).map((p) => p.stake),
          active: d?.delegate?.active ?? true,
        };
      })
      .filter((p) => p.stake > 0 || p.fees > 0 || p.delegate)
      .sort((a, b) => b.stake - a.stake);

    const unbonding = data.unbonding.filter((l) => scoped.includes(l.account));

    return {
      series,
      stake,
      fees,
      roundSeconds,
      rate,
      apr,
      rewards30,
      fees30,
      share,
      lastReward,
      positions,
      unbonding,
    };
  }, [data, scope, scoped, accounts, nowSec]);

  const delegates = useMemo(
    () => [
      ...new Set(
        (view?.positions ?? [])
          .map((p) => p.delegate)
          .filter(Boolean) as string[]
      ),
    ],
    [view]
  );
  const { data: updates } = useOrchestratorUpdates(
    delegates,
    nowSec - 30 * 86400
  );
  const { data: events, isLoading: eventsLoading } = useAccountEvents(
    scoped,
    12
  );

  const insights = useMemo<Insight[]>(() => {
    if (!view || !data) return [];
    const out: Insight[] = [];
    for (const d of delegates) {
      const o = orchestrators.get(d);
      const pos = view.positions.find((p) => p.delegate === d);
      if (pos && !pos.active) {
        out.push({
          id: `inactive-${d}`,
          tone: "warning",
          kind: "inactive",
          href: `/orchestrators/${d}`,
          title: (
            <>
              {insightOrchestrator(d)} is not in the active set, so your stake
              with it isn&apos;t earning.
            </>
          ),
          detail: "Consider moving to an active orchestrator.",
        });
        continue;
      }
      if (o && o.rewardWindow > 0 && o.rewardCalls < o.rewardWindow) {
        const missed = o.rewardWindow - o.rewardCalls;
        const perRound =
          view.lastReward *
          (pos && view.stake > 0 ? pos.stake / view.stake : 1);
        out.push({
          id: `missed-${d}`,
          tone: missed >= 3 ? "warning" : "info",
          kind: "missed",
          href: `/orchestrators/${d}`,
          title: (
            <>
              {insightOrchestrator(d)} missed {missed} of the last{" "}
              {o.rewardWindow} reward calls
            </>
          ),
          detail:
            perRound > 0
              ? `Roughly ${formatLPT(
                  missed * perRound
                )} of rewards you didn't receive.`
              : undefined,
        });
      }
    }
    // Most recent cut change per orchestrator in the last 30 days.
    const seen = new Set<string>();
    for (const u of updates ?? []) {
      if (!u.delegate || seen.has(u.delegate)) continue;
      seen.add(u.delegate);
      const o = orchestrators.get(u.delegate);
      out.push({
        id: `cut-${u.id}`,
        tone: "info",
        kind: "cut",
        href: `/orchestrators/${u.delegate}`,
        title: (
          <>
            {insightOrchestrator(u.delegate)} changed its reward cut to{" "}
            {u.rewardCut?.toFixed(1)}% and fee share to {u.feeShare?.toFixed(1)}
            %
          </>
        ),
        detail: `${new Date(u.timestamp * 1000).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}${o ? ` · currently ${o.rewardCut.toFixed(1)}% cut` : ""}`,
      });
    }
    const ready = view.unbonding.filter(
      (l) => l.withdrawRound <= data.currentRound
    );
    if (ready.length) {
      const total = ready.reduce((s, l) => s + l.amount, 0);
      out.push({
        id: "withdraw-ready",
        tone: "positive",
        kind: "withdraw",
        title: (
          <>
            {formatLPT(total)} has finished unbonding and is ready to withdraw
            or restake.
          </>
        ),
      });
    }
    return out;
  }, [view, data, delegates, orchestrators, updates]);

  if (error) return <ErrorNotice error={error} onRetry={() => refetch()} />;

  const loading = isLoading || !view;
  const accruing =
    view && protocol ? view.lastReward * roundState(protocol, now).progress : 0;
  const lpt = prices?.lpt;
  const multi = accounts.length > 1;
  const firstManageable = view?.positions.find((p) =>
    canManage(p.account.address)
  );
  const feesToWithdraw = view?.positions
    .filter((p) => canManage(p.account.address) && p.fees > 0)
    .sort((a, b) => b.fees - a.fees)[0];

  return (
    <div className="flex flex-col">
      {showScope && (
        <div className="mb-5">
          <ScopeBar accounts={accounts} scope={scope} onScope={setScope} />
        </div>
      )}

      <div className="animate-rise">
        <PortfolioHero
          series={view?.series ?? []}
          stake={view?.stake ?? 0}
          lptPrice={lpt}
          accruing={accruing}
          nowSec={nowSec}
          loading={loading}
        />
      </div>

      <div className="mt-4 animate-rise [animation-delay:60ms]">
        <KpiStrip>
          <Kpi
            label="Rewards · 30 days"
            value={
              loading ? (
                <Skeleton className="h-6 w-28" />
              ) : (
                <>
                  +
                  {formatNumber(view!.rewards30, {
                    decimals: view!.rewards30 >= 1000 ? 0 : 2,
                  })}{" "}
                  <span className="text-[15px] text-muted-foreground">LPT</span>
                </>
              )
            }
            sub={
              lpt != null && view ? formatUSD(view.rewards30 * lpt) : undefined
            }
          />
          <Kpi
            label={
              <Tooltip content="Your realised yield over the last 30 rounds, compounded to a year. Not a promise: inflation, reward calls and cuts all move it.">
                <span className="cursor-help underline decoration-dotted decoration-foreground/30 underline-offset-4">
                  Realised APR
                </span>
              </Tooltip>
            }
            value={
              loading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                `${view!.apr.toFixed(2)}%`
              )
            }
            sub={
              view && protocol
                ? `Inflation ${(protocol.inflation / 1e7).toFixed(
                    4
                  )}% per round`
                : undefined
            }
          />
          <Kpi
            label="Unclaimed fees"
            value={
              loading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                formatETH(view!.fees)
              )
            }
            sub={
              feesToWithdraw ? (
                <button
                  type="button"
                  onClick={() =>
                    open({ kind: "withdrawFees", amount: feesToWithdraw.fees })
                  }
                  className="cursor-pointer text-foreground underline-offset-4 hover:underline"
                >
                  Withdraw
                </button>
              ) : view && prices?.eth != null ? (
                formatUSD(view.fees * prices.eth)
              ) : view ? (
                `${formatETH(view.fees30)} earned in 30 days`
              ) : undefined
            }
          />
          <Kpi
            label="Network share"
            value={
              loading ? (
                <Skeleton className="h-6 w-20" />
              ) : view!.share != null ? (
                `${view!.share.toFixed(4)}%`
              ) : (
                "—"
              )
            }
            sub={
              protocol
                ? `of ${formatLPT(protocol.totalActiveStake, {
                    compact: true,
                  })} staked`
                : undefined
            }
          />
        </KpiStrip>
      </div>

      {insights.length > 0 && (
        <Section className="mt-10">
          <SectionHeader
            title="Needs attention"
            description="From the last 30 rounds of your orchestrators' activity"
          />
          <Insights items={insights} />
        </Section>
      )}

      <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-10">
          <section>
            <SectionHeader
              title="Positions"
              description={
                view
                  ? `${view.positions.length} ${
                      view.positions.length === 1 ? "position" : "positions"
                    }${
                      multi
                        ? ` across ${scoped.length} ${
                            scoped.length === 1 ? "account" : "accounts"
                          }`
                        : ""
                    }`
                  : undefined
              }
              action={
                firstManageable?.delegate ? (
                  <Button
                    size="xs"
                    onClick={() =>
                      open({ kind: "delegate", to: firstManageable.delegate! })
                    }
                  >
                    Stake more
                  </Button>
                ) : undefined
              }
            />
            {loading ? (
              <Skeleton className="h-40 w-full rounded-md" />
            ) : (
              <Positions
                positions={view!.positions}
                orchestrators={orchestrators}
                total={view!.stake}
                canManage={canManage}
                showAccount={multi || scoped.length > 1}
              />
            )}
          </section>

          <section>
            <SectionHeader title="Recent activity" />
            <ActivityList
              events={events}
              loading={eventsLoading}
              emptyText="No staking activity for these accounts yet."
            />
          </section>
        </div>

        <aside className="flex flex-col gap-10">
          <section>
            <SectionHeader title="Projected earnings" />
            {loading ? (
              <Skeleton className="h-56 w-full rounded-md" />
            ) : (
              <Projections
                apr={view!.apr}
                lptPrice={lpt}
                rows={[
                  {
                    label: "Day",
                    lpt: projectEarnings(
                      view!.stake,
                      view!.rate,
                      1,
                      view!.roundSeconds
                    ),
                  },
                  {
                    label: "Week",
                    lpt: projectEarnings(
                      view!.stake,
                      view!.rate,
                      7,
                      view!.roundSeconds
                    ),
                  },
                  {
                    label: "Month",
                    lpt: projectEarnings(
                      view!.stake,
                      view!.rate,
                      30,
                      view!.roundSeconds
                    ),
                  },
                  {
                    label: "Year",
                    lpt: projectEarnings(
                      view!.stake,
                      view!.rate,
                      365,
                      view!.roundSeconds
                    ),
                  },
                ]}
              />
            )}
          </section>

          {view && view.unbonding.length > 0 && data && (
            <section>
              <SectionHeader
                title="Pending withdrawals"
                description={`${formatLPT(
                  view.unbonding.reduce((s, l) => s + l.amount, 0)
                )} unbonding`}
              />
              <PendingWithdrawals
                locks={view.unbonding}
                currentRound={data.currentRound}
                roundSeconds={view.roundSeconds}
                canManage={canManage}
              />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
