"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  fetchAccountEvents,
  fetchDays,
  fetchEvents,
  fetchGovernance,
  fetchOrchestrator,
  fetchOrchestrators,
  fetchOrchestratorUpdates,
  fetchProtocol,
  fetchRewardProgress,
} from "@/lib/subgraph/network";
import { fetchPortfolio } from "@/lib/subgraph/portfolio";
import {
  fetchElectorate,
  fetchPollVotes,
  fetchProposalVotes,
  fetchRoundAtBlock,
} from "@/lib/subgraph/votes";

const MINUTE = 60_000;

export function useProtocol() {
  return useQuery({
    queryKey: ["protocol"],
    queryFn: fetchProtocol,
    staleTime: MINUTE,
    refetchInterval: MINUTE,
  });
}

export function usePortfolio(addresses: string[]) {
  const key = [...addresses].map((a) => a.toLowerCase()).sort();
  return useQuery({
    queryKey: ["portfolio", key],
    queryFn: () => fetchPortfolio(key),
    enabled: key.length > 0,
    staleTime: 5 * MINUTE,
    placeholderData: keepPreviousData,
  });
}

export function useOrchestrators() {
  const { data: protocol } = useProtocol();
  return useQuery({
    queryKey: ["orchestrators", protocol?.currentRound],
    queryFn: () => fetchOrchestrators(protocol!),
    enabled: Boolean(protocol),
    staleTime: 5 * MINUTE,
  });
}

export function useOrchestrator(id: string) {
  const { data: protocol } = useProtocol();
  return useQuery({
    queryKey: ["orchestrator", id.toLowerCase(), protocol?.currentRound],
    queryFn: () => fetchOrchestrator(id, protocol!),
    enabled: Boolean(protocol),
    staleTime: 5 * MINUTE,
  });
}

export function useDays(first = 365) {
  return useQuery({
    queryKey: ["days", first],
    queryFn: () => fetchDays(first),
    staleTime: 30 * MINUTE,
  });
}

/** Protocol-wide events, polled often enough to feel live. */
export function useEvents(first = 100) {
  return useQuery({
    queryKey: ["events", first],
    queryFn: () => fetchEvents(first),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

/** Who has called reward in the current round so far. */
export function useRewardProgress(round: number | undefined) {
  return useQuery({
    queryKey: ["reward-progress", round],
    queryFn: () => fetchRewardProgress(round!),
    enabled: round != null,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useAccountEvents(ids: string[], first = 50) {
  const key = [...ids].map((a) => a.toLowerCase()).sort();
  return useQuery({
    queryKey: ["account-events", key, first],
    queryFn: () => fetchAccountEvents(key, first),
    enabled: key.length > 0,
    staleTime: MINUTE,
  });
}

export function useOrchestratorUpdates(ids: string[], sinceTs: number) {
  const key = [...new Set(ids.map((a) => a.toLowerCase()))].sort();
  return useQuery({
    queryKey: ["orchestrator-updates", key, Math.floor(sinceTs / 3600)],
    queryFn: () => fetchOrchestratorUpdates(key, sinceTs),
    enabled: key.length > 0,
    staleTime: 10 * MINUTE,
  });
}

export function useGovernance() {
  return useQuery({
    queryKey: ["governance"],
    queryFn: fetchGovernance,
    staleTime: 5 * MINUTE,
  });
}

export function usePollVotes(poll: string | undefined) {
  return useQuery({
    queryKey: ["votes", "poll", poll],
    queryFn: () => fetchPollVotes(poll!),
    enabled: Boolean(poll),
    staleTime: MINUTE,
  });
}

export function useProposalVotes(proposal: string | undefined) {
  return useQuery({
    queryKey: ["votes", "proposal", proposal],
    queryFn: () => fetchProposalVotes(proposal!),
    enabled: Boolean(proposal),
    staleTime: MINUTE,
  });
}

/**
 * The active set and stake a vote is measured against: a past round's
 * (by round, or by the L1 block a poll ended at), or null when no snapshot
 * applies or the round has no pools indexed.
 */
export function useElectorate(at: { round?: number; block?: number } | null) {
  return useQuery({
    queryKey: ["electorate", at?.round ?? null, at?.block ?? null],
    queryFn: async () => {
      const round =
        at?.round ??
        (at?.block != null ? await fetchRoundAtBlock(at.block) : null);
      return round != null ? fetchElectorate(round) : null;
    },
    enabled: at != null,
    staleTime: 60 * MINUTE,
  });
}

/** LPT and ETH in USD. Non-critical: every caller renders without it. */
export function usePrices() {
  return useQuery({
    queryKey: ["prices"],
    queryFn: async () => {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=livepeer,ethereum&vs_currencies=usd&include_24hr_change=true"
      );
      if (!res.ok) throw new Error("price unavailable");
      const json = await res.json();
      return {
        lpt: json?.livepeer?.usd as number | undefined,
        lptChange24h: json?.livepeer?.usd_24h_change as number | undefined,
        eth: json?.ethereum?.usd as number | undefined,
      };
    },
    staleTime: 5 * MINUTE,
    retry: 1,
  });
}
