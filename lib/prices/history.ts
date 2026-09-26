import { unstable_cache } from "next/cache";

/**
 * USD prices of LPT and ETH at given moments, from Coinbase Exchange's
 * public hourly candles (LPT-USD, ETH-USD). No key, no monthly quota.
 *
 * A moment is priced at the nearest hour boundary (that hour's open), so
 * within 30 minutes of it. Candles are read in fixed, epoch-aligned pages
 * of 300 hours (the API's maximum per request), only the pages asked for.
 * Past prices never change, so a page is cached for good as compact
 * [hour, price] pairs; only the current page refreshes, hourly.
 */

export type Coin = "LPT" | "ETH";

const HOUR = 3600;
const PAGE_HOURS = 300;
const CONCURRENCY = 3;

/** Hour-start (unix s) → USD at that moment (the hour's open). */
export type HourPrices = Map<number, number>;

/** Coinbase candles: `[[time, low, high, open, close, volume], …]`. */
export function parseCandles(json: unknown): HourPrices | null {
  if (!Array.isArray(json)) return null;
  const out: HourPrices = new Map();
  for (const c of json) {
    if (!Array.isArray(c)) continue;
    const [time, , , open] = c;
    if (typeof time === "number" && typeof open === "number" && open > 0)
      out.set(time, open);
  }
  return out;
}

/** The fixed page an hour falls in. */
export const pageOf = (ts: number) =>
  Math.floor(Math.floor(ts / HOUR) / PAGE_HOURS);

/** Price at `ts`: the nearest hour boundary, else the one either side. */
export function priceAt(prices: HourPrices, ts: number): number | null {
  const nearest = Math.round(ts / HOUR) * HOUR;
  for (const h of [nearest, nearest - HOUR, nearest + HOUR]) {
    const p = prices.get(h);
    if (p != null) return p;
  }
  return null;
}

/** The provider's own error text, if it sent one. */
function upstreamMessage(json: unknown): string | null {
  const msg = (json as { message?: unknown } | null)?.message;
  return typeof msg === "string" && msg ? msg.slice(0, 300) : null;
}

async function fetchPage(
  coin: Coin,
  page: number
): Promise<[number, number][]> {
  const start = page * PAGE_HOURS * HOUR;
  const end = start + (PAGE_HOURS - 1) * HOUR;
  const iso = (s: number) => new Date(s * 1000).toISOString();
  const url = `https://api.exchange.coinbase.com/products/${coin}-USD/candles?granularity=3600&start=${iso(
    start
  )}&end=${iso(end)}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "livepeer-explorer",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
      // Cached below in compact form.
      cache: "no-store",
    });
    // The public rate limit is per second: back off briefly and retry.
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    const json = await res.json().catch(() => null);
    const prices = res.ok ? parseCandles(json) : null;
    if (!prices)
      throw new Error(
        `Coinbase ${res.status}: ${
          upstreamMessage(json) ?? "unexpected response"
        }`
      );
    return [...prices];
  }
}

const pastPage = unstable_cache(fetchPage, ["coinbase-hourly"], {
  revalidate: false,
});
const currentPage = unstable_cache(fetchPage, ["coinbase-hourly-current"], {
  revalidate: HOUR,
});

function readPage(coin: Coin, page: number) {
  const current = pageOf(Date.now() / 1000) === page;
  return (current ? currentPage : pastPage)(coin, page);
}

/** USD price of `coin` at each of `times` (unix s); null where unknown. */
export async function pricesAt(
  coin: Coin,
  times: number[]
): Promise<(number | null)[]> {
  if (!times.length) return [];
  // Pages for each moment, plus a neighbour when it sits on a page edge.
  const pages = new Set<number>();
  for (const t of times) {
    pages.add(pageOf(t - HOUR));
    pages.add(pageOf(t + HOUR));
  }
  const now = pageOf(Date.now() / 1000);
  const wanted = [...pages].filter((p) => p <= now).sort((a, b) => a - b);

  const prices: HourPrices = new Map();
  for (let i = 0; i < wanted.length; i += CONCURRENCY) {
    const chunk = await Promise.all(
      wanted.slice(i, i + CONCURRENCY).map((p) => readPage(coin, p))
    );
    for (const pairs of chunk) for (const [h, usd] of pairs) prices.set(h, usd);
  }
  return times.map((t) => priceAt(prices, t));
}
