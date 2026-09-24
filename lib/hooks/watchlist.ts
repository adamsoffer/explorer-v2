"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";

/**
 * Two per-browser address lists back the portfolio:
 *
 * - **Watched** — addresses tracked read-only: someone else's wallet, a
 *   multisig you only monitor.
 * - **Wallets** — accounts you have connected at least once. They stay in
 *   the portfolio when you switch accounts, and their actions ask you to
 *   switch to them in your wallet before signing.
 */

export type SavedAccount = { address: string; label?: string };

const EMPTY: SavedAccount[] = [];

function createAccountStore(key: string) {
  const event = `${key}:changed`;
  // Last value read or written. Also the fallback when storage is blocked
  // (private mode), so the list still works for the life of the page.
  let cache: { raw: string | null; value: SavedAccount[] } = {
    raw: null,
    value: EMPTY,
  };

  const parse = (raw: string | null): SavedAccount[] => {
    try {
      const parsed = JSON.parse(raw ?? "[]");
      if (!Array.isArray(parsed)) return EMPTY;
      return parsed.filter(
        (a): a is SavedAccount =>
          a && typeof a.address === "string" && isAddress(a.address)
      );
    } catch {
      return EMPTY;
    }
  };

  const read = (): SavedAccount[] => {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return cache.value;
    }
    if (raw === cache.raw) return cache.value;
    cache = { raw, value: parse(raw) };
    return cache.value;
  };

  const write = (next: SavedAccount[]) => {
    const raw = JSON.stringify(next);
    cache = { raw, value: next };
    try {
      window.localStorage.setItem(key, raw);
    } catch {
      // Blocked storage: the in-memory cache carries it for this page.
    }
    window.dispatchEvent(new Event(event));
  };

  const subscribe = (onChange: () => void) => {
    window.addEventListener(event, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(event, onChange);
      window.removeEventListener("storage", onChange);
    };
  };

  const add = (address: string, label?: string) => {
    const current = read();
    const lower = address.toLowerCase();
    if (current.some((a) => a.address === lower)) return;
    write([...current, { address: lower, label: label?.trim() || undefined }]);
  };

  const remove = (address: string) => {
    const lower = address.toLowerCase();
    write(read().filter((a) => a.address !== lower));
  };

  const rename = (address: string, label: string) => {
    const lower = address.toLowerCase();
    write(
      read().map((a) =>
        a.address === lower ? { ...a, label: label.trim() || undefined } : a
      )
    );
  };

  return { read, subscribe, add, remove, rename };
}

const watched = createAccountStore("livepeer-explorer.watchlist");
const wallets = createAccountStore("livepeer-explorer.wallets");

function useStore(store: ReturnType<typeof createAccountStore>) {
  const list = useSyncExternalStore(store.subscribe, store.read, () => EMPTY);
  return {
    list,
    // Module-level functions: already stable across renders.
    add: store.add,
    remove: store.remove,
    rename: store.rename,
  };
}

/** Read-only addresses. */
export function useWatchlist() {
  return useStore(watched);
}

/** Accounts you have connected before. */
export function useKnownWallets() {
  return useStore(wallets);
}

/**
 * Remembers each account as it connects, and promotes it out of the
 * watchlist if you had been tracking it read-only. Mount once, app-wide.
 */
export function WalletMemory() {
  const { address, isConnected } = useAccount();
  useEffect(() => {
    if (!isConnected || !address) return;
    const lower = address.toLowerCase();
    const watchedEntry = watched.read().find((a) => a.address === lower);
    wallets.add(lower, watchedEntry?.label);
    if (watchedEntry) watched.remove(lower);
  }, [address, isConnected]);
  return null;
}

export type PortfolioAccount = {
  address: string;
  label?: string;
  /**
   * `wallet` — the account active in your wallet right now.
   * `known` — one of your wallets, connected before but not active.
   * `watched` — tracked read-only.
   */
  source: "wallet" | "known" | "watched";
};

/** Active wallet first, then your other wallets, then watched addresses. */
export function usePortfolioAccounts() {
  const { address, isConnected, status } = useAccount();
  const { list: watchedList } = useWatchlist();
  const { list: walletList } = useKnownWallets();
  const active = isConnected && address ? address.toLowerCase() : null;

  const accounts = useMemo(() => {
    const out: PortfolioAccount[] = [];
    const seen = new Set<string>();
    const push = (a: PortfolioAccount) => {
      if (seen.has(a.address)) return;
      seen.add(a.address);
      out.push(a);
    };
    const labelOf = (addr: string) =>
      walletList.find((w) => w.address === addr)?.label;
    if (active)
      push({ address: active, label: labelOf(active), source: "wallet" });
    for (const w of walletList) push({ ...w, source: "known" });
    for (const w of watchedList) push({ ...w, source: "watched" });
    return out;
  }, [active, walletList, watchedList]);

  const owned = useMemo(
    () =>
      new Set(
        accounts.filter((a) => a.source !== "watched").map((a) => a.address)
      ),
    [accounts]
  );

  return {
    accounts,
    walletAddress: active,
    /** True for any of your wallets, active or not. */
    isOwned: useCallback((a: string) => owned.has(a.toLowerCase()), [owned]),
    isReconnecting: status === "reconnecting" || status === "connecting",
  };
}
