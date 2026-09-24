"use client";

import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Coins,
  LogIn,
  LogOut,
  Percent,
  RotateCcw,
  Sparkles,
  Wallet,
} from "lucide-react";

import { Avatar, useIdentity } from "@/components/identity";
import { Card, EmptyState } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { txUrl } from "@/lib/config";
import {
  formatETH,
  formatLPT,
  formatRelativeTime,
  shortAddress,
} from "@/lib/format";
import { useWatchlist } from "@/lib/hooks/watchlist";
import type { ActivityEvent } from "@/lib/subgraph/network";

function Name({ address }: { address?: string }) {
  const { name } = useIdentity(address);
  const { list } = useWatchlist();
  const label = list.find((w) => w.address === address?.toLowerCase())?.label;
  if (!address) return null;
  return (
    <span className="text-foreground">
      {label ?? name ?? (
        <span className="font-mono text-[13px]">{shortAddress(address)}</span>
      )}
    </span>
  );
}

function ActorAvatar({ address }: { address: string }) {
  const { avatar } = useIdentity(address);
  return <Avatar address={address} src={avatar} size={28} />;
}

function describe(e: ActivityEvent): {
  icon: React.ElementType;
  text: React.ReactNode;
  actor?: string;
} {
  switch (e.type) {
    case "Bond":
      if (
        e.oldDelegate &&
        e.delegate &&
        e.oldDelegate !== e.delegate &&
        !/^0x0+$/.test(e.oldDelegate)
      ) {
        return {
          icon: ArrowRightLeft,
          actor: e.delegator,
          text: (
            <>
              <Name address={e.delegator} /> switched from{" "}
              <Name address={e.oldDelegate} /> to <Name address={e.delegate} />
              {e.amount ? <> and delegated {formatLPT(e.amount)} more</> : null}
            </>
          ),
        };
      }
      return {
        icon: ArrowDownLeft,
        actor: e.delegator,
        text: (
          <>
            <Name address={e.delegator} /> delegated {formatLPT(e.amount ?? 0)}{" "}
            to <Name address={e.delegate} />
          </>
        ),
      };
    case "Unbond":
      return {
        icon: ArrowUpRight,
        actor: e.delegator,
        text: (
          <>
            <Name address={e.delegator} /> undelegated{" "}
            {formatLPT(e.amount ?? 0)} from <Name address={e.delegate} />
          </>
        ),
      };
    case "Rebond":
      return {
        icon: RotateCcw,
        actor: e.delegator,
        text: (
          <>
            <Name address={e.delegator} /> redelegated{" "}
            {formatLPT(e.amount ?? 0)} to <Name address={e.delegate} />
          </>
        ),
      };
    case "Reward":
      return {
        icon: Sparkles,
        actor: e.delegate,
        text: (
          <>
            <Name address={e.delegate} /> called reward, minting{" "}
            {formatLPT(e.amount ?? 0)} to its pool
          </>
        ),
      };
    case "TranscoderUpdate":
      return {
        icon: Percent,
        actor: e.delegate,
        text: (
          <>
            <Name address={e.delegate} /> set reward cut to{" "}
            {e.rewardCut?.toFixed(1)}% and fee share to {e.feeShare?.toFixed(1)}
            %
          </>
        ),
      };
    case "WithdrawStake":
      return {
        icon: Wallet,
        actor: e.delegator,
        text: (
          <>
            <Name address={e.delegator} /> withdrew {formatLPT(e.amount ?? 0)}
          </>
        ),
      };
    case "WithdrawFees":
      return {
        icon: Coins,
        actor: e.delegator,
        text: (
          <>
            <Name address={e.delegator} /> withdrew {formatETH(e.amount ?? 0)}{" "}
            in fees
          </>
        ),
      };
    case "TransferBond":
      return {
        icon: ArrowRightLeft,
        actor: e.delegator,
        text: (
          <>
            <Name address={e.delegator} /> transferred{" "}
            {formatLPT(e.amount ?? 0)} of stake to <Name address={e.delegate} />
          </>
        ),
      };
    case "TranscoderActivated":
      return {
        icon: LogIn,
        actor: e.delegate,
        text: (
          <>
            <Name address={e.delegate} /> joined the active set
          </>
        ),
      };
    case "TranscoderDeactivated":
      return {
        icon: LogOut,
        actor: e.delegate,
        text: (
          <>
            <Name address={e.delegate} /> left the active set
          </>
        ),
      };
    default:
      return { icon: Sparkles, text: e.type };
  }
}

export function ActivityList({
  events,
  loading,
  emptyText = "No activity yet.",
  showActor = true,
}: {
  events?: ActivityEvent[];
  loading?: boolean;
  emptyText?: string;
  showActor?: boolean;
}) {
  if (loading) {
    return (
      <Card className="divide-y divide-(--hairline)">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ))}
      </Card>
    );
  }
  if (!events?.length) {
    return (
      <Card>
        <EmptyState title={emptyText} />
      </Card>
    );
  }
  return (
    <Card className="divide-y divide-(--hairline)">
      {events.map((e) => {
        const { icon: Icon, text, actor } = describe(e);
        return (
          <div key={e.id} className="flex items-center gap-3 px-4 py-3">
            {showActor && actor ? (
              <span className="relative flex shrink-0">
                <ActorAvatar address={actor} />
                <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border-2 border-muted bg-secondary text-muted-foreground">
                  <Icon className="size-2.5" />
                </span>
              </span>
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-hover text-muted-foreground">
                <Icon className="size-3.5" />
              </span>
            )}
            <p className="min-w-0 flex-1 text-ui-body text-muted-foreground">
              {text}
            </p>
            <Tooltip
              content={`Round ${e.round.toLocaleString()} · ${new Date(
                e.timestamp * 1000
              ).toLocaleString()}`}
            >
              <a
                href={txUrl(e.tx)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-ui-caption whitespace-nowrap text-subtle-foreground hover:text-foreground"
              >
                {formatRelativeTime(e.timestamp)}
              </a>
            </Tooltip>
          </div>
        );
      })}
    </Card>
  );
}
