"use client";

import { useMemo, useState } from "react";

import { ActivityList } from "@/components/activity-list";
import { ErrorNotice, Page, PageHeader } from "@/components/page";
import { Segmented, StatusDot } from "@/components/ui/misc";
import { useEvents } from "@/lib/hooks/queries";

type Filter = "all" | "staking" | "rewards" | "orchestrators" | "fees";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "staking", label: "Staking" },
  { value: "rewards", label: "Rewards" },
  { value: "orchestrators", label: "Orchestrators" },
  { value: "fees", label: "Fees" },
] as const;

const TYPES: Record<Exclude<Filter, "all">, readonly string[]> = {
  staking: ["Bond", "Unbond", "Rebond", "TransferBond", "WithdrawStake"],
  rewards: ["Reward"],
  orchestrators: [
    "TranscoderUpdate",
    "TranscoderActivated",
    "TranscoderDeactivated",
  ],
  fees: ["WithdrawFees"],
};

const EMPTY: Record<Filter, string> = {
  all: "No recent activity.",
  staking: "No recent staking activity.",
  rewards: "No recent reward calls.",
  orchestrators: "No recent orchestrator changes.",
  fees: "No recent fee withdrawals.",
};

export default function ActivityPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading, error, refetch } = useEvents(200);

  const events = useMemo(
    () =>
      filter === "all"
        ? data
        : data?.filter((e) => TYPES[filter].includes(e.type)),
    [data, filter]
  );

  return (
    <Page>
      <PageHeader
        title="Activity"
        description="Live protocol events on Arbitrum"
        actions={
          <span className="flex items-center gap-2 text-ui-caption text-muted-foreground">
            <StatusDot pulse={!error} tone={error ? "warning" : "positive"} />
            Updating every minute
          </span>
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

      {error && !data ? (
        <ErrorNotice error={error} onRetry={() => refetch()} />
      ) : (
        <ActivityList
          events={events}
          loading={isLoading}
          emptyText={EMPTY[filter]}
        />
      )}
    </Page>
  );
}
