"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  type DailyPrices,
  dailyPrices,
  type EarningsAccount,
  earningsCsv,
} from "@/lib/portfolio/csv";

/**
 * Daily USD closes from CoinGecko. The public API serves a year of daily
 * history; older rounds are exported without a USD value.
 */
async function history(coin: "livepeer" | "ethereum"): Promise<DailyPrices> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=usd&days=365&interval=daily`,
    { signal: AbortSignal.timeout(15_000) }
  );
  if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
  const json = (await res.json()) as { prices?: [number, number][] };
  return dailyPrices(json.prices ?? []);
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportEarnings({
  accounts,
  name,
}: {
  accounts: EarningsAccount[];
  /** Used in the file name, e.g. a wallet's label. */
  name: string;
}) {
  const [busy, setBusy] = useState(false);
  const empty = !accounts.some((a) =>
    a.series.some((p) => p.rewards > 0 || p.fees > 0)
  );

  const run = async () => {
    setBusy(true);
    let lpt: DailyPrices = new Map();
    let eth: DailyPrices = new Map();
    let priced = true;
    try {
      [lpt, eth] = await Promise.all([
        history("livepeer"),
        history("ethereum"),
      ]);
    } catch {
      priced = false;
    }
    const csv = earningsCsv(accounts, { lpt, eth });
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    download(
      `livepeer-earnings-${slug || "portfolio"}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`,
      csv
    );
    setBusy(false);
    if (!priced)
      toast.warning("Exported without USD values", {
        description: "Price history couldn't be loaded. Try again later.",
      });
  };

  return (
    <Tooltip content="Download rewards and fees, round by round, with USD values at the time (past 12 months)">
      <Button
        variant="ghost"
        size="xs"
        onClick={run}
        disabled={busy || empty}
        aria-label="Export earnings as CSV"
      >
        {busy ? <Loader2 className="animate-spin" /> : <Download />} CSV
      </Button>
    </Tooltip>
  );
}
