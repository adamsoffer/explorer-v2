import { pageOf, parseDataApi, parseLegacy, priceAt } from "./history";

const H = Date.UTC(2026, 0, 1, 12) / 1000; // an hour boundary

describe("price history", () => {
  it("reads the CoinDesk Data API shape", () => {
    const m = parseDataApi({
      Data: [
        { TIMESTAMP: H, OPEN: 5.1, CLOSE: 5.2 },
        { TIMESTAMP: H + 3600, OPEN: 0 }, // no trading: dropped
      ],
      Err: {},
    });
    expect([...m!]).toEqual([[H, 5.1]]);
    expect(parseDataApi({ Err: { message: "bad key" } })).toBeNull();
  });

  it("reads the legacy CryptoCompare shape", () => {
    const m = parseLegacy({
      Response: "Success",
      Data: { Data: [{ time: H, open: 3000, close: 3010 }] },
    });
    expect([...m!]).toEqual([[H, 3000]]);
    expect(
      parseLegacy({ Response: "Error", Message: "rate limit" })
    ).toBeNull();
  });

  it("prices a moment at the nearest hour", () => {
    const m = new Map([
      [H, 5],
      [H + 3600, 6],
    ]);
    expect(priceAt(m, H + 20 * 60)).toBe(5);
    expect(priceAt(m, H + 40 * 60)).toBe(6);
    // Nearest hour missing: a neighbouring one.
    expect(priceAt(m, H - 50 * 60)).toBe(5);
    expect(priceAt(m, H + 5 * 3600)).toBeNull();
  });

  it("puts every hour in a fixed page of 2,000", () => {
    expect(pageOf(0)).toBe(0);
    expect(pageOf(1999 * 3600)).toBe(0);
    expect(pageOf(2000 * 3600)).toBe(1);
  });
});

jest.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

describe("pricesAt", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("falls back to the legacy API and prices each moment", async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("data-api.coindesk.com"))
        return new Response("{}", { status: 401 });
      const toTs = Number(new URL(u).searchParams.get("toTs"));
      // 2,001 hourly rows ending at toTs, priced by hour.
      const rows = Array.from({ length: 2001 }, (_, i) => {
        const time = toTs - (2000 - i) * 3600;
        return { time, open: time / 3600 };
      });
      return Response.json({ Response: "Success", Data: { Data: rows } });
    }) as typeof fetch;

    const { pricesAt } = await import("./history");
    const t = H + 35 * 60; // nearest hour: H + 1h
    const [p] = await pricesAt("LPT", [t]);
    expect(p).toBe((H + 3600) / 3600);
    expect(calls.some((c) => c.includes("min-api.cryptocompare.com"))).toBe(
      true
    );
  });
});
