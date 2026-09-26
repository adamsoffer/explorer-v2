"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { useProtocol } from "@/lib/hooks/queries";
import type { Protocol } from "@/lib/subgraph/network";

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function roundState(p: Protocol, nowMs: number) {
  const elapsed = Math.max(0, nowMs / 1000 - p.roundStartTs);
  const remaining = p.roundSeconds - elapsed;
  const progress = Math.min(1, Math.max(0, elapsed / p.roundSeconds));
  const blocksElapsed = Math.min(
    p.roundLength,
    Math.floor(elapsed / p.secondsPerBlock)
  );
  return {
    progress,
    remaining,
    overdue: remaining <= 0,
    initialized: p.lastInitializedRound >= p.currentRound,
    endsAt: (p.roundStartTs + p.roundSeconds) * 1000,
    blocksElapsed,
  };
}

export function Ring({
  progress,
  size = 28,
  stroke = 3,
  tone = "positive",
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  tone?: "positive" | "warning";
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-foreground/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          className={cn(
            "transition-[stroke-dashoffset] duration-1000 ease-linear",
            tone === "positive" ? "stroke-green-bright" : "stroke-warm"
          )}
        />
      </svg>
      {children && (
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          {children}
        </span>
      )}
    </span>
  );
}

/** Compact, always-visible protocol heartbeat for the sidebar. */
export function SidebarRoundClock() {
  const { data } = useProtocol();
  const now = useNow(1000);

  if (!data) {
    return (
      <div className="flex items-center gap-3 px-2 py-2">
        <span className="size-7 animate-shimmer rounded-full bg-foreground/[0.06]" />
        <span className="flex flex-col gap-1.5">
          <span className="h-3 w-20 animate-shimmer rounded-sm bg-foreground/[0.06]" />
          <span className="h-2.5 w-14 animate-shimmer rounded-sm bg-foreground/[0.06]" />
        </span>
      </div>
    );
  }

  const s = roundState(data, now);
  const endsAt = new Date(s.endsAt).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Tooltip
      side="right"
      content={
        <span className="flex flex-col gap-0.5">
          <span>
            {s.overdue
              ? `Round ${data.currentRound + 1} can be initialized now`
              : `Round ${data.currentRound + 1} starts around ${endsAt}`}
          </span>
          <span className="opacity-70">
            ~{s.blocksElapsed.toLocaleString()} of{" "}
            {data.roundLength.toLocaleString()} L1 blocks
          </span>
        </span>
      }
    >
      <Link
        href="/network"
        className="flex items-center gap-3 rounded-sm px-2 py-2 transition-colors hover:bg-hover"
      >
        <Ring
          progress={s.progress}
          tone={s.overdue || !s.initialized ? "warning" : "positive"}
        />
        <span className="flex min-w-0 flex-col">
          <span className="text-ui-caption text-foreground">
            Round{" "}
            <span className="font-mono tabular-nums">
              {data.currentRound.toLocaleString()}
            </span>
          </span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {s.overdue
              ? "Ready to initialize"
              : `${formatDuration(s.remaining)} left`}
          </span>
        </span>
      </Link>
    </Tooltip>
  );
}
