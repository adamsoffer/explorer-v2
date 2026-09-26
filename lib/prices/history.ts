import { unstable_cache } from "next/cache";

/**
 * USD prices of LPT and ETH at given moments, from CoinDesk Data (formerly
 * CryptoCompare). Server-only: the key is secret.
 *
 * Prices are hourly, the finest history the API keeps beyond the last few
 * days: a moment is priced at the nearest hour boundary, so within 30
 * minutes of it. History is read in fixed, epoch-aligned pages of 2,000
 * hours (~83 days), only the pages an export touches. Past prices never
 * change, so a page is cached as compact [hour, price] pairs (~40 KB)
 * rather than the API's ~30-field rows; only the current page refreshes.
 *
 * The current Data API is tried first; the legacy CryptoCompare API, which
 * takes the same key, is the fallback.
 */

export type Coin = "LPT" | "ETH";

const HOUR = 3600;
const PAGE_HOURS = 2000;

/** Hour-start (unix s) → USD at that moment (the hour's open). */
export type HourPrices = Map<number, number>;

/** CoinDesk Data API: `{ Data: [{ TIMESTAMP, OPEN }] }`. */
export function parseDataApi(json: unknown): HourPrices | null {
  const rows = (json as { Data?: unknown })?.Data;
  if (!Array.isArray(rows)) return null;
  const out: HourPrices = new Map();
  for (const r of rows as { TIMESTAMP?: unknown; OPEN?: unknown }[])
    if (
      typeof r?.TIMESTAMP === "number" &&
      typeof r?.OPEN === "number" &&
      r.OPEN > 0
    )
      out.set(r.TIMESTAMP, r.OPEN);
  return out;
}

/** Legacy CryptoCompare: `{ Response, Data: { Data: [{ time, open }] } }`. */
export function parseLegacy(json: unknown): HourPrices | null {
  const j = json as { Response?: string; Data?: { Data?: unknown } };
  if (j?.Response && j.Response !== "Success") return null;
  const rows = j?.Data?.Data;
  if (!Array.isArray(rows)) return null;
  const out: HourPrices = new Map();
  for (const r of rows as { time?: unknown; open?: unknown }[])
    if (
      typeof r?.time === "number" &&
      typeof r?.open === "number" &&
      r.open > 0
    )
      out.set(r.time, r.open);
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

/** The provider's own error text, from either API's error shape. */
function upstreamMessage(json: unknown): string | null {
  const j = json as {
    Message?: unknown;
    Err?: { message?: unknown };
  } | null;
  const msg = j?.Err?.message ?? j?.Message;
  return typeof msg === "string" && msg ? msg.slice(0, 300) : null;
}

type Source = {
  name: string;
  url: (coin: Coin, toTs: number) => string;
  parse: (json: unknown) => HourPrices | null;
};

const SOURCES: Source[] = [
  {
    name: "CoinDesk Data API",
    url: (coin, toTs) =>
      `https://data-api.coindesk.com/index/cc/v1/historical/hours?market=cadli&instrument=${coin}-USD&limit=${PAGE_HOURS}&to_ts=${toTs}&fill=true&apply_mapping=true&response_format=JSON`,
    parse: parseDataApi,
  },
  {
    name: "CryptoCompare API",
    url: (coin, toTs) =>
      `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${coin}&tsym=USD&limit=${PAGE_HOURS}&toTs=${toTs}`,
    parse: parseLegacy,
  },
];

async function fetchPage(
  name: string,
  coin: Coin,
  page: number
): Promise<[number, number][]> {
  const source = SOURCES.find((s) => s.name === name)!;
  // Read here rather than passed in, so the key never becomes a cache key.
  const key = process.env.COINDESK_API_KEY ?? "";
  const last = ((page + 1) * PAGE_HOURS - 1) * HOUR;
  const res = await fetch(source.url(coin, last), {
    headers: { Authorization: `Apikey ${key}` },
    signal: AbortSignal.timeout(15_000),
    // Cached below in compact form; the raw rows are too big to keep.
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  const prices = res.ok ? source.parse(json) : null;
  if (!prices)
    throw new Error(
      `${source.name} ${res.status}: ${
        upstreamMessage(json) ?? "unexpected response"
      }`
    );
  return [...prices];
}

const pastPage = unstable_cache(fetchPage, ["price-page"], {
  revalidate: false,
});
const currentPage = unstable_cache(fetchPage, ["price-page-current"], {
  revalidate: HOUR,
});

function readPage(source: Source, coin: Coin, page: number) {
  const current = pageOf(Date.now() / 1000) === page;
  return (current ? currentPage : pastPage)(source.name, coin, page);
}

async function readPages(source: Source, coin: Coin, pages: number[]) {
  const all: [number, number][] = [];
  // A few at a time, to stay inside the API's rate limit.
  for (let i = 0; i < pages.length; i += 4) {
    const chunk = await Promise.all(
      pages.slice(i, i + 4).map((p) => readPage(source, coin, p))
    );
    for (const pairs of chunk) all.push(...pairs);
  }
  return all;
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

  const errors: string[] = [];
  for (const source of SOURCES) {
    try {
      const prices = new Map(await readPages(source, coin, wanted));
      return times.map((t) => priceAt(prices, t));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(errors.join("; "));
}
