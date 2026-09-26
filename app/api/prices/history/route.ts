import { pricesAt } from "@/lib/prices/history";

const MAX_TIMES = 20_000;
const MAX_GET_TIMES = 50;
const EARLIEST = Date.UTC(2015, 0, 1) / 1000;

/**
 * USD prices of LPT and ETH at the moments asked for (unix seconds), for
 * valuing earnings at the time. Read from CoinDesk Data on the server so
 * the key stays secret; the upstream pages are cached there.
 *
 * POST { times: number[] } → { lpt: (number | null)[], eth: (number | null)[] }
 * GET ?times=1735689600,1704067200 — the same for a few moments, handy for
 * checking from a browser.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    times?: unknown;
  } | null;
  return respond(body?.times, MAX_TIMES);
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("times");
  const times = raw
    ? raw
        .split(",")
        .filter(Boolean)
        .map((t) => Number(t))
    : undefined;
  return respond(times, MAX_GET_TIMES);
}

async function respond(times: unknown, max: number) {
  if (!process.env.COINDESK_API_KEY)
    return Response.json(
      { error: "Price history isn't configured (COINDESK_API_KEY)." },
      { status: 503 }
    );

  const now = Date.now() / 1000;
  if (
    !Array.isArray(times) ||
    !times.length ||
    times.length > max ||
    !times.every(
      (t) =>
        typeof t === "number" &&
        Number.isFinite(t) &&
        t >= EARLIEST &&
        t <= now + 86_400
    )
  )
    return Response.json(
      { error: `Send 1 to ${max} unix timestamps (seconds) as times.` },
      { status: 400 }
    );

  try {
    const [lpt, eth] = await Promise.all([
      pricesAt("LPT", times),
      pricesAt("ETH", times),
    ]);
    return Response.json({ times, lpt, eth });
  } catch (e) {
    console.error("Price history:", e);
    // Provider errors only (status and message); they never carry the key.
    return Response.json(
      {
        error: "Price history is unavailable right now.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    );
  }
}
