"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowRight,
  CornerDownLeft,
  Eye,
  Search,
  Server,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { isAddress } from "viem";
import { normalize } from "viem/ens";
import { useEnsAddress } from "wagmi";

import { Avatar, useIdentity } from "@/components/identity";
import { cn } from "@/lib/cn";
import { L1_CHAIN } from "@/lib/config";
import { formatLPT, shortAddress } from "@/lib/format";
import { useOrchestrators } from "@/lib/hooks/queries";
import { useWatchlist } from "@/lib/hooks/watchlist";

import { NAV } from "./nav";

type Item = {
  id: string;
  group: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ReactNode;
  run: () => void;
};

function OrchestratorLabel({ address }: { address: string }) {
  const { name } = useIdentity(address);
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate">
        {name ?? (
          <span className="font-mono text-[13px]">{shortAddress(address)}</span>
        )}
      </span>
      {name && (
        <span className="font-mono text-[11px] text-subtle-foreground">
          {shortAddress(address)}
        </span>
      )}
    </span>
  );
}

export function CommandSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { data: orchestrators } = useOrchestrators();
  const { add, list } = useWatchlist();

  const trimmed = query.trim();
  const looksEns = /\.[a-z]{2,}$/i.test(trimmed) && !trimmed.startsWith("0x");
  let ensName: string | undefined;
  try {
    ensName = looksEns ? normalize(trimmed) : undefined;
  } catch {
    ensName = undefined;
  }
  const { data: ensAddress } = useEnsAddress({
    name: ensName,
    chainId: L1_CHAIN.id,
    query: { enabled: Boolean(ensName), retry: false },
  });
  const target = isAddress(trimmed)
    ? trimmed.toLowerCase()
    : ensAddress?.toLowerCase();

  const close = () => {
    onOpenChange(false);
    setQuery("");
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const q = trimmed.toLowerCase();

    if (target) {
      const isOrchestrator = orchestrators?.some((o) => o.id === target);
      out.push({
        id: `acct-${target}`,
        group: "Address",
        label: (
          <span className="font-mono text-[13px]">
            {ensName ?? shortAddress(target, 10, 8)}
          </span>
        ),
        hint: "View account",
        icon: <Avatar address={target} size={18} />,
        run: () =>
          router.push(
            isOrchestrator ? `/orchestrators/${target}` : `/accounts/${target}`
          ),
      });
      if (!list.some((w) => w.address === target)) {
        out.push({
          id: `watch-${target}`,
          group: "Address",
          label: "Track in your portfolio",
          hint: "Read-only",
          icon: <Eye className="size-4" />,
          run: () => {
            add(target, ensName);
            router.push("/");
          },
        });
      }
    }

    for (const n of NAV) {
      if (!q || n.label.toLowerCase().includes(q)) {
        const Icon = n.icon;
        out.push({
          id: `nav-${n.href}`,
          group: "Go to",
          label: n.label,
          icon: <Icon className="size-4" strokeWidth={1.75} />,
          run: () => router.push(n.href),
        });
      }
    }

    if (orchestrators && !target) {
      const matches = orchestrators
        .filter((o) => !q || o.id.includes(q))
        .slice(0, q ? 8 : 5);
      for (const o of matches) {
        out.push({
          id: `orch-${o.id}`,
          group: q ? "Orchestrators" : "Top orchestrators",
          label: <OrchestratorLabel address={o.id} />,
          hint: (
            <span className="font-mono tabular-nums">
              {formatLPT(o.totalStake, { compact: true })}
            </span>
          ),
          icon: <Avatar address={o.id} size={18} />,
          run: () => router.push(`/orchestrators/${o.id}`),
        });
      }
    }
    return out;
  }, [trimmed, target, ensName, orchestrators, list, router, add]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(items.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[cursor];
      if (item) {
        item.run();
        close();
      }
    }
  };

  let lastGroup = "";

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[140] bg-overlay backdrop-blur-[2px] data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        <DialogPrimitive.Popup className="fixed top-[12vh] left-1/2 z-[140] w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-xl border border-hairline bg-popover shadow-(--shadow-popover) outline-none duration-150 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.98]">
          <DialogPrimitive.Title className="sr-only">
            Search
          </DialogPrimitive.Title>
          <div className="flex items-center gap-2.5 border-b border-hairline px-4">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search orchestrators, paste an address or ENS name"
              aria-label="Search"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-results"
              aria-activedescendant={
                items[cursor] ? `cmd-${items[cursor].id}` : undefined
              }
              className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle-foreground"
            />
            <kbd className="rounded-[4px] border border-hairline px-1.5 text-[10px] leading-4 text-subtle-foreground">
              esc
            </kbd>
          </div>
          <div
            ref={listRef}
            id="command-results"
            role="listbox"
            className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5"
          >
            {items.length === 0 && (
              <p className="px-3 py-8 text-center text-ui-body text-muted-foreground">
                {looksEns && !ensAddress ? "Resolving name…" : "No matches"}
              </p>
            )}
            {items.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {header && (
                    <div className="px-2.5 pt-2.5 pb-1 text-[11px] font-medium text-subtle-foreground">
                      {header}
                    </div>
                  )}
                  <div
                    id={`cmd-${item.id}`}
                    role="option"
                    aria-selected={i === cursor}
                    data-index={i}
                    onMouseMove={() => setCursor(i)}
                    onClick={() => {
                      item.run();
                      close();
                    }}
                    className={cn(
                      "flex h-10 cursor-pointer items-center gap-3 rounded-md px-2.5 text-ui-body",
                      i === cursor
                        ? "bg-hover text-foreground"
                        : "text-foreground/90"
                    )}
                  >
                    <span className="flex size-5 items-center justify-center text-muted-foreground">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className="text-ui-caption text-muted-foreground">
                        {item.hint}
                      </span>
                    )}
                    {i === cursor && (
                      <CornerDownLeft className="size-3.5 text-subtle-foreground" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 border-t border-hairline px-4 py-2 text-[11px] text-subtle-foreground">
            <span className="flex items-center gap-1">
              <ArrowRight className="size-3" /> to open
            </span>
            <span className="flex items-center gap-1">
              <User className="size-3" /> addresses open their account
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <Server className="size-3" /> orchestrators open their profile
            </span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
