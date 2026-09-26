import type { SeriesPoint } from "./compute";
import { dailyPrices, earningsCsv } from "./csv";

const DAY1 = Date.UTC(2026, 8, 1) / 1000;
const DAY2 = Date.UTC(2026, 8, 2) / 1000;

const point = (p: Partial<SeriesPoint>): SeriesPoint => ({
  round: 1,
  ts: DAY1,
  stake: 100,
  rewards: 0,
  commission: 0,
  fees: 0,
  share: null,
  ...p,
});

describe("dailyPrices", () => {
  it("keys by UTC day and keeps the day's first price", () => {
    const m = dailyPrices([
      [DAY1 * 1000, 5],
      [DAY2 * 1000, 6],
      [DAY2 * 1000 + 3_600_000, 7],
    ]);
    expect(m.get("2026-09-01")).toBe(5);
    expect(m.get("2026-09-02")).toBe(6);
  });
});

describe("earningsCsv", () => {
  const prices = {
    lpt: new Map([["2026-09-01", 5]]),
    eth: new Map([["2026-09-01", 2000]]),
  };

  it("writes one row per round with earnings, valued at that day's price", () => {
    const csv = earningsCsv(
      [
        {
          address: "0xabc",
          label: 'Cold, "vault"',
          series: [
            point({ round: 10, ts: DAY1 + 3600, rewards: 1.5, fees: 0.001 }),
            point({ round: 11, ts: DAY2 }), // nothing earned: skipped
          ],
        },
      ],
      prices
    );
    const [header, row, ...rest] = csv.trim().split("\n");
    expect(header.split(",")).toHaveLength(12);
    expect(rest).toHaveLength(0);
    expect(row).toBe(
      '2026-09-01T01:00:00Z,10,0xabc,"Cold, ""vault""",1.5,0,0.001,5,2000,7.5,2,100'
    );
  });

  it("neutralises labels a spreadsheet would run as formulas", () => {
    const csv = earningsCsv(
      [
        {
          address: "0xa",
          label: "=HYPERLINK(1)",
          series: [point({ rewards: 1 })],
        },
      ],
      prices
    );
    expect(csv).toContain(",'=HYPERLINK(1),");
  });

  it("leaves USD blank when there's no price for the day", () => {
    const csv = earningsCsv(
      [{ address: "0xabc", series: [point({ ts: DAY2, rewards: 2 })] }],
      prices
    );
    const cells = csv.trim().split("\n")[1].split(",");
    expect(cells[7]).toBe("");
    expect(cells[9]).toBe("");
  });

  it("orders rows by round across wallets", () => {
    const csv = earningsCsv(
      [
        { address: "0xb", series: [point({ round: 2, rewards: 1 })] },
        {
          address: "0xa",
          series: [
            point({ round: 1, rewards: 1 }),
            point({ round: 2, rewards: 1 }),
          ],
        },
      ],
      prices
    );
    const keys = csv
      .trim()
      .split("\n")
      .slice(1)
      .map((l) => l.split(",").slice(1, 3).join(":"));
    expect(keys).toEqual(["1:0xa", "2:0xa", "2:0xb"]);
  });
});
