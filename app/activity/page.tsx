"use client";

import { ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";

import { ActivityList } from "@/components/activity-list";
import { LiveStatus } from "@/components/live-status";
import { ErrorNotice, Page, PageHeader } from "@/components/page";
import { Segmented } from "@/components/ui/misc";
import { useLiveFeed } from "@/lib/hooks/live-feed";
import { useEvents } from "@/lib/hooks/queries";

type Filter =
  | "all"
  | "fees"
  | "staking"
  | "rewards"
  | "governance"
  | "orchestrators"
  | "gateways";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "fees", label: "Fees" },
  { value: "staking", label: "Staking" },
  { value: "rewards", label: "Rewards" },
  { value: "governance", label: "Governance" },
  { value: "orchestrators", label: "Orchestrators" },
  { value: "gateways", label: "Gateways" },
] as const;

const TYPES: Record<Exclude<Filter, "all">, readonly string[]> = {
  fees: ["WinningTicketRedeemed", "WithdrawFees"],
  staking: ["Bond", "Unbond", "Rebond", "TransferBond", "WithdrawStake"],
  rewards: ["Reward", "NewRound"],
  governance: ["Vote", "TreasuryVote", "PollCreated"],
  orchestrators: [
    "TranscoderUpdate",
    "TranscoderActivated",
    "TranscoderDeactivated",
  ],
  gateways: ["DepositFunded", "ReserveFunded", "Withdrawal"],
};

const EMPTY: Record<Filter, string> = {
  all: "No recent activity.",
  fees: "No recent fee activity.",
  staking: "No recent staking activity.",
  rewards: "No recent reward calls.",
  governance: "No recent votes.",
  orchestrators: "No recent orchestrator changes.",
  gateways: "No recent gateway deposits or withdrawals.",
};

export default function ActivityPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading, error, refetch, dataUpdatedAt } = useEvents(200);
  const { shown, fresh, waiting, reveal } = useLiveFeed(data);

  const events = useMemo(
    () =>
      filter === "all"
        ? shown
        : shown?.filter((e) => TYPES[filter].includes(e.type)),
    [shown, filter]
  );

  return (
    <Page>
      <PageHeader
        title="Activity"
        description="Every protocol event on Arbitrum as it's indexed: fees earned, delegations, reward calls, votes and gateway deposits."
        actions={
          <LiveStatus updatedAt={dataUpdatedAt} failing={Boolean(error)} />
        }
      />

      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Segmented
          label="Filter events"
          value={filter}
          onChange={setFilter}
          options={FILTERS}
        />
      </div>

      {waiting > 0 && (
        <div className="pointer-events-none sticky top-16 z-20 flex justify-center lg:top-4">
          <button
            type="button"
            onClick={reveal}
            className="pointer-events-auto inline-flex animate-rise cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-ui-caption font-medium text-background shadow-(--shadow-popover)"
          >
            <ArrowUp className="size-3.5" />
            {waiting} new {waiting === 1 ? "event" : "events"}
          </button>
        </div>
      )}

      {error && !data ? (
        <ErrorNotice error={error} onRetry={() => refetch()} />
      ) : (
        <ActivityList
          events={events}
          loading={isLoading || !shown}
          emptyText={EMPTY[filter]}
          fresh={fresh}
        />
      )}
    </Page>
  );
}
