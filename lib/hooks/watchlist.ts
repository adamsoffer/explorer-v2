"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";

/**
 * Addresses the viewer tracks without connecting them — a cold wallet, a
 * multisig, a second hot wallet. Stored per browser; the portfolio treats
 * them exactly like the connected wallet, just read-only.
 */

export type WatchedAccount = { address: string; label?: string };

const KEY = "livepeer-explorer.watchlist";
const EVENT = "livepeer-explorer:watchlist";
const EMPTY: WatchedAccount[] = [];

let cache: { raw: string | null; value: WatchedAccount[] } = {
  raw: null,
  value: EMPTY,
};

function read(): WatchedAccount[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.value;
  let value = EMPTY;
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (Array.isArray(parsed)) {
      value = parsed.filter(
        (a): a is WatchedAccount =>
          a && typeof a.address === "string" && isAddress(a.address)
      );
    }
  } catch {
    value = EMPTY;
  }
  cache = { raw, value };
  return value;
}

function write(next: WatchedAccount[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: the list lives for this page only.
    cache = { raw: JSON.stringify(next), value: next };
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useWatchlist() {
  const list = useSyncExternalStore(subscribe, read, () => EMPTY);

  const add = useCallback((address: string, label?: string) => {
    const current = read();
    const lower = address.toLowerCase();
    if (current.some((a) => a.address.toLowerCase() === lower)) return;
    write([...current, { address: lower, label: label?.trim() || undefined }]);
  }, []);

  const remove = useCallback((address: string) => {
    const lower = address.toLowerCase();
    write(read().filter((a) => a.address.toLowerCase() !== lower));
  }, []);

  const rename = useCallback((address: string, label: string) => {
    const lower = address.toLowerCase();
    write(
      read().map((a) =>
        a.address.toLowerCase() === lower
          ? { ...a, label: label.trim() || undefined }
          : a
      )
    );
  }, []);

  return { list, add, remove, rename };
}

export type PortfolioAccount = {
  address: string;
  label?: string;
  source: "wallet" | "watched";
};

/** Connected wallet first, then watched addresses, deduplicated. */
export function usePortfolioAccounts() {
  const { address, isConnected, status } = useAccount();
  const { list } = useWatchlist();

  const accounts = useMemo(() => {
    const out: PortfolioAccount[] = [];
    if (isConnected && address) {
      out.push({ address: address.toLowerCase(), source: "wallet" });
    }
    for (const w of list) {
      if (out.some((a) => a.address === w.address.toLowerCase())) continue;
      out.push({
        address: w.address.toLowerCase(),
        label: w.label,
        source: "watched",
      });
    }
    return out;
  }, [address, isConnected, list]);

  return {
    accounts,
    walletAddress: isConnected && address ? address.toLowerCase() : null,
    isReconnecting: status === "reconnecting" || status === "connecting",
  };
}
