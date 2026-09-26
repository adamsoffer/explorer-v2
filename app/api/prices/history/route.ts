import { pricesAt } from "@/lib/prices/history";

const MAX_TIMES = 20_000;
const EARLIEST = Date.UTC(2015, 0, 1) / 1000;

/**
 * USD prices of LPT and ETH at the moments asked for (unix seconds), for
 * valuing earnings at the time. Read from CoinDesk Data on the server so
 * the key stays secret; the upstream pages are cached there.
 *
 * POST { times: number[] } → { lpt: (number | null)[], eth: (number | null)[] }
 */
export async function POST(req: Request) {
  const key = process.env.COINDESK_API_KEY;
  if (!key)
    return Response.json(
      { error: "Price history isn't configured (COINDESK_API_KEY)." },
      { status: 503 }
    );

  const body = (await req.json().catch(() => null)) as {
    times?: unknown;
  } | null;
  const times = body?.times;
  const now = Date.now() / 1000;
  if (
    !Array.isArray(times) ||
    times.length > MAX_TIMES ||
    !times.every(
      (t) =>
        typeof t === "number" &&
        Number.isFinite(t) &&
        t >= EARLIEST &&
        t <= now + 86_400
    )
  )
    return Response.json(
      { error: `Send up to ${MAX_TIMES} unix timestamps as { times }.` },
      { status: 400 }
    );

  try {
    const [lpt, eth] = await Promise.all([
      pricesAt("LPT", times),
      pricesAt("ETH", times),
    ]);
    return Response.json({ lpt, eth });
  } catch (e) {
    console.error("Price history:", e);
    return Response.json(
      { error: "Price history is unavailable right now." },
      { status: 502 }
    );
  }
}
