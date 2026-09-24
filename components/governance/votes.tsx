"use client";

import { useQueries } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ExternalLink,
  Search,
  Users,
  Vote,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useConfig } from "wagmi";
import { getEnsNameQueryOptions } from "wagmi/query";

import { Identity } from "@/components/identity";
import { Card, EmptyState, ErrorNotice } from "@/components/page";
import { useNow } from "@/components/shell/round-clock";
import { Button } from "@/components/ui/button";
import { Input, Segmented, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { L1_CHAIN, txUrl } from "@/lib/config";
import { formatLPT, formatPercent, formatRelativeTime } from "@/lib/format";
import type { Orchestrator } from "@/lib/subgraph/network";
import type { CastVote, VoteChoice } from "@/lib/subgraph/votes";

import type { TallySeries } from "./tally";

const PAGE = 25;

type List = "voted" | "not-voted";
type SortKey = "weight" | "choice" | "time";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const VOTED_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 sm:grid-cols-[minmax(0,1fr)_88px_128px_104px]";
const NOT_VOTED_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4";

const pct = (share: number) =>
  formatPercent(share, { decimals: share < 1 ? 2 : 1 });

/* ── Search by address or ENS name ───────────────────────────────────────── */

/**
 * ENS names for every address, fetched only while searching. Shares the
 * cache with the per-row `useEnsName` lookups, so rows already on screen
 * cost nothing extra.
 */
function useEnsNames(addresses: string[], enabled: boolean) {
  const config = useConfig();
  const results = useQueries({
    queries: addresses.map((address) => ({
      ...getEnsNameQueryOptions(config, {
        address: address as `0x${string}`,
        chainId: L1_CHAIN.id,
      }),
      enabled,
      staleTime: 60 * 60_000,
      retry: false,
    })),
  });
  const map = new Map<string, string>();
  results.forEach((r, i) => {
    if (r.data) map.set(addresses[i], r.data.toLowerCase());
  });
  return map;
}

/* ── Cells ───────────────────────────────────────────────────────────────── */

function ChoiceLabel({
  choice,
  series,
}: {
  choice: VoteChoice;
  series: TallySeries[];
}) {
  const s = series.find((x) => x.key === choice);
  return (
    <span className="inline-flex items-center gap-1.5 text-ui-body">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: s?.color }}
      />
      {s?.label ?? choice}
    </span>
  );
}

function WeightCell({ weight, share }: { weight: number; share: number }) {
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="font-mono text-[13px] tabular-nums">
        {formatLPT(weight, { compact: true })}
      </span>
      <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
        <span className="hidden h-1 w-10 overflow-hidden rounded-full bg-foreground/[0.08] sm:block">
          <span
            className="block h-full rounded-full bg-foreground/40"
            style={{ width: `${Math.min(100, Math.max(2, share))}%` }}
          />
        </span>
        {pct(share)}
      </span>
    </span>
  );
}

function When({ vote, nowMs }: { vote: CastVote; nowMs: number }) {
  if (!vote.timestamp) return <>—</>;
  const label = formatRelativeTime(vote.timestamp, nowMs);
  if (!vote.tx) return <>{label}</>;
  return (
    <a
      href={txUrl(vote.tx)}
      target="_blank"
      rel="noreferrer"
      title={new Date(vote.timestamp * 1000).toLocaleString()}
      className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
    >
      {label}
      <ExternalLink className="size-3" />
    </a>
  );
}

function Reason({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 180;
  return (
    <blockquote className="col-span-full mt-1 border-l-2 border-hairline pl-3 text-ui-caption whitespace-pre-line text-muted-foreground">
      <span className={cn(!open && long && "line-clamp-2")}>{text}</span>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-0.5 block cursor-pointer text-foreground hover:underline"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </blockquote>
  );
}

function OverridesToggle({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-sm text-[11px] whitespace-nowrap text-warm hover:underline"
    >
      {count} override{count === 1 ? "" : "s"}
      <ChevronDown
        className={cn("size-3 transition-transform", open && "rotate-180")}
      />
    </button>
  );
}

/** Delegators of an orchestrator who voted their own stake. */
function OverrideRows({
  votes,
  series,
  nowMs,
}: {
  votes: CastVote[];
  series: TallySeries[];
  nowMs: number;
}) {
  return (
    <ul className="col-span-full -mx-4 mt-2 border-t border-hairline bg-foreground/[0.025]">
      {votes.map((v) => (
        <li
          key={v.voter}
          className={cn(VOTED_GRID, "py-2 pl-10 text-ui-caption")}
        >
          <Identity address={v.voter} size={20} secondary="Delegator" />
          <span className="justify-self-end sm:justify-self-start">
            <ChoiceLabel choice={v.choice} series={series} />
          </span>
          <span className="col-start-1 font-mono text-[12px] text-muted-foreground tabular-nums sm:col-start-auto sm:justify-self-end">
            {formatLPT(v.weight, { compact: true })}
          </span>
          <span className="justify-self-end text-muted-foreground">
            <When vote={v} nowMs={nowMs} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === k;
  const Arrow = sort.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground",
        align === "right" && "justify-self-end",
        active && "text-foreground"
      )}
    >
      {label}
      {active && <Arrow className="size-3" />}
    </button>
  );
}

function ShowMore({
  shown,
  total,
  onMore,
}: {
  shown: number;
  total: number;
  onMore: () => void;
}) {
  if (shown >= total) return null;
  return (
    <div className="border-t border-hairline p-2">
      <Button variant="ghost" size="sm" className="w-full" onClick={onMore}>
        Show all {total.toLocaleString()}
      </Button>
    </div>
  );
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

/**
 * Who voted and which active orchestrators haven't, for a poll or treasury
 * proposal. Orchestrators vote with their delegators' stake; a delegator who
 * votes themselves overrides that for their own stake, and those overrides
 * are grouped under their orchestrator.
 */
export function VotesPanel({
  votes,
  isLoading,
  error,
  onRetry,
  series,
  orchestrators,
  ended,
}: {
  votes: CastVote[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  series: TallySeries[];
  orchestrators: Orchestrator[] | undefined;
  ended: boolean;
}) {
  const nowMs = useNow(60_000);
  const [list, setList] = useState<List>("voted");
  const [limit, setLimit] = useState(PAGE);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "weight", dir: "desc" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const all = useMemo(() => votes ?? [], [votes]);
  const active = useMemo(
    () =>
      (orchestrators ?? [])
        .filter((o) => o.active)
        .sort((a, b) => b.totalStake - a.totalStake),
    [orchestrators]
  );
  const voterIds = useMemo(() => new Set(all.map((v) => v.voter)), [all]);
  const nonVoters = useMemo(
    () => active.filter((o) => !voterIds.has(o.id)),
    [active, voterIds]
  );
  const overrides = useMemo(() => {
    const map = new Map<string, CastVote[]>();
    for (const v of all) {
      if (v.orchestrator || !v.delegate) continue;
      map.set(v.delegate, [...(map.get(v.delegate) ?? []), v]);
    }
    for (const group of map.values()) group.sort((a, b) => b.weight - a.weight);
    return map;
  }, [all]);

  const q = query.trim().toLowerCase();
  const addresses = useMemo(
    () => [...all.map((v) => v.voter), ...nonVoters.map((o) => o.id)],
    [all, nonVoters]
  );
  const names = useEnsNames(addresses, q.length > 0);
  const matches = (address: string) =>
    !q || address.includes(q) || Boolean(names.get(address)?.includes(q));

  const votedWeight = all.reduce((s, v) => s + v.weight, 0);
  const activeStake = active.reduce((s, o) => s + o.totalStake, 0);
  const missingStake = nonVoters.reduce((s, o) => s + o.totalStake, 0);

  const rank = (v: CastVote) =>
    sort.key === "weight"
      ? v.weight
      : sort.key === "time"
      ? v.timestamp ?? 0
      : series.findIndex((s) => s.key === v.choice);
  const shownVotes = all
    .filter((v) => matches(v.voter))
    .sort((a, b) => {
      const d = rank(a) - rank(b) || a.weight - b.weight;
      return sort.dir === "asc" ? d : -d;
    });
  const shownNonVoters = nonVoters.filter((o) => matches(o.id));
  const shownRows =
    list === "voted" ? shownVotes.length : shownNonVoters.length;
  const visible = q ? shownRows : Math.min(limit, shownRows);

  if (error) return <ErrorNotice error={error} onRetry={onRetry} />;

  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    );
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const switchTo = (l: List) => {
    setList(l);
    setLimit(PAGE);
  };

  const counts = series
    .map((s) => ({ ...s, n: all.filter((v) => v.choice === s.key).length }))
    .filter((s) => s.n > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Votes list"
          value={list}
          onChange={switchTo}
          options={[
            {
              value: "voted",
              label: `Voted${
                votes ? ` · ${votes.length.toLocaleString()}` : ""
              }`,
            },
            {
              value: "not-voted",
              label: `Didn't vote${
                votes && orchestrators ? ` · ${nonVoters.length}` : ""
              }`,
            },
          ]}
        />
        <label className="relative w-full sm:w-56">
          <span className="sr-only">Search voters</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search address or ENS"
            className="h-8 pl-8 text-ui-body"
          />
        </label>
      </div>

      {votes && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-caption text-muted-foreground">
          {list === "voted" ? (
            <>
              {counts.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.n.toLocaleString()} {s.label}
                </span>
              ))}
              {orchestrators && active.length > 0 && (
                <span>
                  {active.length - nonVoters.length} of {active.length} active
                  orchestrators voted
                </span>
              )}
            </>
          ) : orchestrators ? (
            <span>
              {formatLPT(missingStake, { compact: true })} (
              {pct(activeStake > 0 ? (missingStake / activeStake) * 100 : 0)} of
              active stake) is with orchestrators who haven&apos;t voted. Their
              delegators&apos; stake only counts if they vote themselves.
              {ended && " Based on today's active set and stake."}
            </span>
          ) : null}
        </p>
      )}

      {isLoading || !votes ? (
        <Card className="flex flex-col gap-4 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 w-40" />
              <div className="flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </Card>
      ) : list === "voted" && all.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Vote />}
            title="No votes yet"
            description="Votes appear here as soon as they're indexed."
          />
        </Card>
      ) : list === "not-voted" && !orchestrators ? (
        <Card className="h-40" />
      ) : list === "not-voted" && nonVoters.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title="Every active orchestrator voted"
          />
        </Card>
      ) : shownRows === 0 ? (
        <Card>
          <EmptyState
            icon={<Search />}
            title="No matches"
            description={`Nobody in this list matches “${query.trim()}”.`}
          />
        </Card>
      ) : list === "voted" ? (
        <Card>
          <div
            className={cn(
              VOTED_GRID,
              "hidden border-b border-hairline py-2.5 text-ui-caption text-muted-foreground sm:grid"
            )}
          >
            <span>Voter</span>
            <SortHeader label="Vote" k="choice" sort={sort} onSort={onSort} />
            <SortHeader
              label="Weight"
              k="weight"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <SortHeader
              label="When"
              k="time"
              sort={sort}
              onSort={onSort}
              align="right"
            />
          </div>
          <ul>
            {shownVotes.slice(0, visible).map((v) => {
              const share =
                votedWeight > 0 ? (v.weight / votedWeight) * 100 : 0;
              const own = v.orchestrator ? overrides.get(v.voter) ?? [] : [];
              const open = expanded.has(v.voter);
              return (
                <li
                  key={v.voter}
                  className={cn(
                    VOTED_GRID,
                    "border-b border-hairline py-3 last:border-0"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Identity
                      address={v.voter}
                      href={
                        v.orchestrator
                          ? `/orchestrators/${v.voter}`
                          : `/accounts/${v.voter}`
                      }
                      size={24}
                      secondary={v.orchestrator ? "Orchestrator" : "Delegator"}
                    />
                    {own.length > 0 && (
                      <OverridesToggle
                        count={own.length}
                        open={open}
                        onToggle={() => toggle(v.voter)}
                      />
                    )}
                  </span>
                  <span className="justify-self-end sm:justify-self-start">
                    <ChoiceLabel choice={v.choice} series={series} />
                  </span>
                  <span className="col-start-1 sm:col-start-auto sm:justify-self-end">
                    <span className="sm:hidden">
                      <span className="font-mono text-[13px] tabular-nums">
                        {formatLPT(v.weight, { compact: true })}
                      </span>
                      <span className="ml-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                        {pct(share)}
                      </span>
                    </span>
                    <span className="hidden sm:block">
                      <WeightCell weight={v.weight} share={share} />
                    </span>
                  </span>
                  <span className="justify-self-end text-ui-caption text-muted-foreground">
                    <When vote={v} nowMs={nowMs} />
                  </span>
                  {v.reason && <Reason text={v.reason} />}
                  {open && (
                    <OverrideRows votes={own} series={series} nowMs={nowMs} />
                  )}
                </li>
              );
            })}
          </ul>
          {!q && (
            <ShowMore
              shown={visible}
              total={shownRows}
              onMore={() => setLimit(shownRows)}
            />
          )}
        </Card>
      ) : (
        <Card>
          <div
            className={cn(
              NOT_VOTED_GRID,
              "hidden border-b border-hairline py-2.5 text-ui-caption text-muted-foreground sm:grid"
            )}
          >
            <span>Orchestrator</span>
            <span className="text-right">Stake</span>
          </div>
          <ul>
            {shownNonVoters.slice(0, visible).map((o) => {
              const own = overrides.get(o.id) ?? [];
              const open = expanded.has(o.id);
              return (
                <li
                  key={o.id}
                  className={cn(
                    NOT_VOTED_GRID,
                    "border-b border-hairline py-3 last:border-0"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Identity
                      address={o.id}
                      href={`/orchestrators/${o.id}`}
                      size={24}
                    />
                    {own.length > 0 && (
                      <OverridesToggle
                        count={own.length}
                        open={open}
                        onToggle={() => toggle(o.id)}
                      />
                    )}
                  </span>
                  <WeightCell
                    weight={o.totalStake}
                    share={
                      activeStake > 0 ? (o.totalStake / activeStake) * 100 : 0
                    }
                  />
                  {open && (
                    <OverrideRows votes={own} series={series} nowMs={nowMs} />
                  )}
                </li>
              );
            })}
          </ul>
          {!q && (
            <ShowMore
              shown={visible}
              total={shownRows}
              onMore={() => setLimit(shownRows)}
            />
          )}
        </Card>
      )}
    </div>
  );
}
