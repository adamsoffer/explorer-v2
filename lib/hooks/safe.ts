"use client";

import { useAccount, useReadContract } from "wagmi";

import { L2_CHAIN } from "@/lib/config";

const SAFE_ABI = [
  {
    type: "function",
    name: "getThreshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * Whether `address` (default: the connected account) is a Safe: connected
 * as a Safe App, or a contract answering Safe's `getThreshold`, which
 * covers a Safe connected over WalletConnect. Undefined while checking.
 *
 * A Safe's wallet returns the hash of a proposal, not of a transaction:
 * nothing lands on-chain until its owners sign and execute it, so there's
 * no receipt to wait for.
 */
export function useIsSafe(address?: string): boolean | undefined {
  const { connector, address: active } = useAccount();
  const target = (address ?? active)?.toLowerCase() as
    | `0x${string}`
    | undefined;
  const viaSafeApp =
    connector?.id === "safe" && target === active?.toLowerCase();
  const { data, isPending } = useReadContract({
    address: target,
    abi: SAFE_ABI,
    functionName: "getThreshold",
    chainId: L2_CHAIN.id,
    query: {
      enabled: Boolean(target) && !viaSafeApp,
      retry: false,
      staleTime: Infinity,
    },
  });
  if (viaSafeApp) return true;
  if (!target || isPending) return undefined;
  return data !== undefined;
}

/** The Safe's queue of transactions awaiting signatures, on Arbitrum. */
export const safeQueueUrl = (safe: string) =>
  `https://app.safe.global/transactions/queue?safe=arb1:${safe}`;

/** Opens the explorer inside Safe{Wallet} as a Safe App. */
export const safeAppUrl = (safe: string) =>
  `https://app.safe.global/apps/open?safe=arb1:${safe}&appUrl=${encodeURIComponent(
    window.location.origin
  )}`;
