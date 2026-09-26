import { mergeEventPage, type RawEvent } from "./network";

const ev = (id: string, ts: number, type = "RewardEvent"): RawEvent => ({
  id,
  __typename: type,
  round: { id: "1" },
  timestamp: ts,
  transaction: { id: `0x${id}`, from: "0x1" },
});

describe("mergeEventPage", () => {
  it("returns everything, newest first, when no collection is full", () => {
    const page = mergeEventPage(
      {
        rewards: [ev("a", 30), ev("b", 10)],
        bonds: [ev("c", 20, "BondEvent")],
      },
      5
    );
    expect(page.events.map((e) => e.id)).toEqual(["a", "c", "b"]);
    expect(page.next).toBeNull();
  });

  it("stops where a full collection might still have older events", () => {
    // rewards is full at 3: anything at or below its oldest (20) may be
    // incomplete, so bonds' event at 15 waits for the next page.
    const page = mergeEventPage(
      {
        rewards: [ev("r1", 40), ev("r2", 30), ev("r3", 20)],
        bonds: [ev("b1", 35, "BondEvent"), ev("b2", 15, "BondEvent")],
      },
      3
    );
    expect(page.events.map((e) => e.id)).toEqual(["r1", "b1", "r2"]);
    expect(page.next).toBe(20);
  });

  it("holds back events sharing the cutoff timestamp for the next page", () => {
    const page = mergeEventPage(
      {
        rewards: [ev("r1", 30), ev("r2", 20)],
        bonds: [ev("b1", 20, "BondEvent")],
      },
      2
    );
    expect(page.events.map((e) => e.id)).toEqual(["r1"]);
    expect(page.next).toBe(20);
  });
});
