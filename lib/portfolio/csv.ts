import type { SeriesPoint } from "./compute";

/**
 * Earnings, one row per wallet per round with anything earned: LPT rewards
 * (and the commission part of them), ETH fees, and their USD value at that
 * day's price. For taxes and bookkeeping, so values are plain decimals,
 * dates are UTC, and a missing price is left blank rather than guessed.
 */

export type DailyPrices = Map<string, number>;

export type EarningsAccount = {
  address: string;
  label?: string;
  series: SeriesPoint[];
};

/** UTC calendar day, the key CoinGecko's daily prices are bucketed by. */
export const utcDay = (ts: number) =>
  new Date(ts * 1000).toISOString().slice(0, 10);

/** CoinGecko `market_chart` prices ([ms, usd][]) keyed by UTC day. */
export function dailyPrices(prices: [number, number][]): DailyPrices {
  const out: DailyPrices = new Map();
  // Daily granularity is stamped at 00:00 UTC; the last entry is "now" and
  // shouldn't replace today's opening price.
  for (const [ms, usd] of prices) {
    const day = utcDay(ms / 1000);
    if (!out.has(day)) out.set(day, usd);
  }
  return out;
}

const HEADER = [
  "Date (UTC)",
  "Round",
  "Wallet",
  "Label",
  "Rewards (LPT)",
  "Commission (LPT)",
  "Fees (ETH)",
  "LPT price (USD)",
  "ETH price (USD)",
  "Rewards (USD)",
  "Fees (USD)",
  "Stake after round (LPT)",
];

const num = (n: number, decimals: number) =>
  n
    .toFixed(decimals)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");

function cell(value: string) {
  // A label starting with = + - @ would run as a formula in a spreadsheet.
  if (/^[=+\-@]/.test(value) && !/^-?\d/.test(value)) value = `'${value}`;
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function earningsCsv(
  accounts: EarningsAccount[],
  prices: { lpt: DailyPrices; eth: DailyPrices }
) {
  const rows = accounts.flatMap((a) =>
    a.series.filter((p) => p.rewards > 0 || p.fees > 0).map((p) => ({ a, p }))
  );
  rows.sort(
    (x, y) => x.p.round - y.p.round || x.a.address.localeCompare(y.a.address)
  );
  const lines = rows.map(({ a, p }) => {
    const day = utcDay(p.ts);
    const lpt = prices.lpt.get(day);
    const eth = prices.eth.get(day);
    return [
      new Date(p.ts * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      String(p.round),
      a.address,
      a.label ?? "",
      num(p.rewards, 10),
      num(p.commission, 10),
      num(p.fees, 10),
      lpt != null ? num(lpt, 6) : "",
      eth != null ? num(eth, 2) : "",
      lpt != null ? num(p.rewards * lpt, 2) : "",
      eth != null ? num(p.fees * eth, 2) : "",
      num(p.stake, 10),
    ]
      .map(cell)
      .join(",");
  });
  return [HEADER.join(","), ...lines].join("\n") + "\n";
}
