// Dev-only mock of the Livepeer staging subgraph + CoinGecko price endpoint.
// Usage: node scripts/mock/server.mjs [--port 4010] [--seed 20260924]
// Answers the operations in lib/subgraph/{portfolio,network}.ts by operation name.

import http from "node:http";

import { generate } from "./fixtures.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg("port", process.env.MOCK_PORT ?? 4010));
const SEED = Number(arg("seed", 20260924));
const VERBOSE = process.argv.includes("--verbose");

const f = generate({
  seed: SEED,
  now: Number(process.env.MOCK_NOW) || undefined,
});
console.log(
  `[mock] seed=${SEED} round=${f.protocol.currentRound} orchestrators=${f.transcoders.length} ` +
    `delegators=${f.delegators.size} pools=${[...f.pools.values()].reduce(
      (s, p) => s + p.length,
      0
    )} events=${f.events.length}`
);
console.log(`[mock] demo: ${JSON.stringify(f.demo)}`);

export const COINGECKO = {
  livepeer: { usd: 6.42, usd_24h_change: 1.8 },
  ethereum: { usd: 3120.5 },
};

/* ── Shapers ─────────────────────────────────────────────────────────────── */

const ref = (id) => (id == null ? null : { id: String(id) });
const byIdAsc = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const page = (rows, { first = 100, lastId = "" } = {}) =>
  rows
    .filter((r) => r.id > (lastId ?? ""))
    .sort(byIdAsc)
    .slice(0, first);
const lower = (xs) => (xs ?? []).map((x) => String(x).toLowerCase());

const transcoderById = new Map(f.transcoders.map((t) => [t.id, t]));
const delegatorsByDelegate = new Map();
for (const d of f.delegators.values()) {
  if (!d.delegate) continue;
  if (!delegatorsByDelegate.has(d.delegate))
    delegatorsByDelegate.set(d.delegate, []);
  delegatorsByDelegate.get(d.delegate).push(d);
}

function shapeDelegator(d) {
  const t = d.delegate ? transcoderById.get(d.delegate) : null;
  return {
    id: d.id,
    bondedAmount: d.bondedAmount,
    principal: d.principal,
    unbonded: d.unbonded,
    fees: d.fees,
    withdrawnFees: d.withdrawnFees,
    shares: d.shares,
    startRound: d.startRound,
    lastClaimRound: ref(d.lastClaimRound),
    delegate: t
      ? {
          id: t.id,
          active: t.active,
          status: t.status,
          rewardCut: t.rewardCut,
          feeShare: t.feeShare,
          totalStake: t.totalStake,
          lastRewardRound: ref(t.lastRewardRound),
          pendingRewardCommission: t.pendingRewardCommission,
          pendingFeeCommission: t.pendingFeeCommission,
        }
      : null,
    unbondingLocks: f.locks
      .filter((l) => l.delegator === d.id)
      .map((l) => ({
        id: l.id,
        unbondingLockId: l.unbondingLockId,
        amount: l.amount,
        withdrawRound: l.withdrawRound,
        delegate: { id: l.delegate },
      })),
  };
}

function shapePool(p, withTs) {
  return {
    id: p.id,
    round: withTs
      ? {
          id: String(p.round),
          startTimestamp: f.roundByNum.get(p.round).startTimestamp,
        }
      : { id: String(p.round) },
    cumulativeRewardFactor: p.cumulativeRewardFactor,
    cumulativeFeeFactor: p.cumulativeFeeFactor,
    rewardTokens: p.rewardTokens,
    rewardCut: p.rewardCut,
    feeShare: p.feeShare,
    totalStake: p.totalStake,
    fees: p.fees,
  };
}

function windowPools(id, windowStart) {
  return f.pools
    .get(id)
    .filter((p) => f.roundByNum.get(p.round).startTimestamp >= windowStart)
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .slice(0, 60)
    .map((p) => ({
      round: { id: String(p.round) },
      rewardTokens: p.rewardTokens,
      cumulativeRewardFactor: p.cumulativeRewardFactor,
    }));
}

function shapeTranscoder(t, windowStart, withLifetime) {
  const out = {
    id: t.id,
    active: t.active,
    status: t.status,
    totalStake: t.totalStake,
    rewardCut: t.rewardCut,
    feeShare: t.feeShare,
    rewardCutUpdateTimestamp: t.rewardCutUpdateTimestamp,
    feeShareUpdateTimestamp: t.feeShareUpdateTimestamp,
    activationTimestamp: t.activationTimestamp,
    lastRewardRound: ref(t.lastRewardRound),
    thirtyDayVolumeETH: t.thirtyDayVolumeETH,
    ninetyDayVolumeETH: t.ninetyDayVolumeETH,
    totalVolumeETH: t.totalVolumeETH,
    serviceURI: t.serviceURI,
    delegator: { bondedAmount: t._selfBonded },
    delegators: (delegatorsByDelegate.get(t.id) ?? [])
      .slice(0, 1000)
      .map((d) => ({ id: d.id })),
    pools: windowPools(t.id, windowStart),
  };
  if (withLifetime) {
    out.lifetimeRewardCommission = t.lifetimeRewardCommission;
    out.lifetimeFeeCommission = t.lifetimeFeeCommission;
  }
  return out;
}

function shapeEvent(e) {
  const base = {
    id: e.id,
    __typename: e.__typename,
    round: { id: String(e.round) },
    timestamp: e.timestamp,
    transaction: { id: e.tx, from: e.from },
  };
  switch (e.__typename) {
    case "BondEvent":
      return {
        ...base,
        delegator: ref(e.delegator),
        newDelegate: ref(e.newDelegate),
        oldDelegate: ref(e.oldDelegate),
        additionalAmount: e.additionalAmount,
      };
    case "UnbondEvent":
    case "RebondEvent":
      return {
        ...base,
        delegate: ref(e.delegate),
        delegator: ref(e.delegator),
        amount: e.amount,
      };
    case "TranscoderUpdateEvent":
      return {
        ...base,
        delegate: ref(e.delegate),
        rewardCut: e.rewardCut,
        feeShare: e.feeShare,
      };
    case "RewardEvent":
      return {
        ...base,
        delegate: ref(e.delegate),
        rewardTokens: e.rewardTokens,
      };
    case "WithdrawStakeEvent":
    case "WithdrawFeesEvent":
      return { ...base, delegator: ref(e.delegator), amount: e.amount };
    case "TranscoderActivatedEvent":
    case "TranscoderDeactivatedEvent":
      return { ...base, delegate: ref(e.delegate) };
    default:
      return base;
  }
}

/* ── Resolvers (by operation name) ───────────────────────────────────────── */

const resolvers = {
  Delegators: ({ ids }) => ({
    protocol: { currentRound: { id: String(f.protocol.currentRound) } },
    delegators: lower(ids)
      .map((id) => f.delegators.get(id))
      .filter(Boolean)
      .map(shapeDelegator),
  }),

  Snapshots: ({ ids, first, lastId }) => {
    const set = new Set(lower(ids));
    return {
      delegatorSnapshots: page(
        f.snapshots.filter((s) => set.has(s.delegator)),
        { first, lastId }
      ).map((s) => ({
        id: s.id,
        delegator: { id: s.delegator },
        delegate: ref(s.delegate),
        round: { id: String(s.round) },
        shares: s.shares,
        timestamp: s.timestamp,
      })),
    };
  },

  Pools: ({ delegate, first, lastId }) => ({
    pools: page(f.pools.get(String(delegate).toLowerCase()) ?? [], {
      first,
      lastId,
    }).map((p) => shapePool(p, false)),
  }),

  OrchestratorPools: ({ delegate, first, lastId }) => ({
    pools: page(f.pools.get(String(delegate).toLowerCase()) ?? [], {
      first,
      lastId,
    }).map((p) => shapePool(p, true)),
  }),

  Rounds: ({ since, first, lastId }) => ({
    rounds: page(
      f.rounds.filter((r) => r.startTimestamp >= Number(since ?? 0)),
      { first, lastId }
    ).map((r) => ({
      id: r.id,
      startTimestamp: r.startTimestamp,
      totalActiveStake: r.totalActiveStake,
    })),
  }),

  Protocol: () => {
    const cur = f.roundByNum.get(f.protocol.currentRound);
    const rest = { ...f.protocol };
    delete rest.currentRound;
    delete rest.lastInitializedRound;
    return {
      protocol: {
        currentRound: { id: cur.id, startTimestamp: cur.startTimestamp },
        lastInitializedRound: { id: String(f.protocol.lastInitializedRound) },
        ...rest,
      },
      rounds: [...f.rounds]
        .sort((a, b) => Number(b.startBlock) - Number(a.startBlock))
        .slice(0, 31)
        .map((r) => ({
          id: r.id,
          startBlock: r.startBlock,
          startTimestamp: r.startTimestamp,
          mintableTokens: r.mintableTokens,
          volumeETH: r.volumeETH,
          newStake: r.newStake,
        })),
    };
  },

  Days: ({ first = 100 }) => ({
    days: [...f.days]
      .sort((a, b) => b.date - a.date)
      .slice(0, first)
      .map(
        ({
          date,
          volumeETH,
          volumeUSD,
          participationRate,
          inflation,
          totalActiveStake,
          delegatorsCount,
          activeTranscoderCount,
        }) => ({
          date,
          volumeETH,
          volumeUSD,
          participationRate,
          inflation,
          totalActiveStake,
          delegatorsCount,
          activeTranscoderCount,
        })
      ),
  }),

  Orchestrators: ({ windowStart = 0 }) => ({
    transcoders: f.transcoders
      .filter((t) => t.active)
      .sort((a, b) => Number(b.totalStake) - Number(a.totalStake))
      .slice(0, 200)
      .map((t) => shapeTranscoder(t, Number(windowStart), false)),
  }),

  Orchestrator: ({ id, windowStart = 0 }) => {
    const key = String(id).toLowerCase();
    const t = transcoderById.get(key);
    return {
      transcoder: t ? shapeTranscoder(t, Number(windowStart), true) : null,
      delegators: (delegatorsByDelegate.get(key) ?? [])
        .filter((d) => Number(d.bondedAmount) > 0)
        .sort((a, b) => Number(b.bondedAmount) - Number(a.bondedAmount))
        .slice(0, 1000)
        .map((d) => ({
          id: d.id,
          bondedAmount: d.bondedAmount,
          startRound: d.startRound,
        })),
    };
  },

  Events: ({ first = 100 }) => ({
    transactions: [...f.transactions]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, first)
      .map((t) => ({ events: t.events.map(shapeEvent) })),
  }),

  AccountEvents: ({ ids, first = 50 }) => {
    const set = new Set(lower(ids));
    const of = (type) =>
      f.events
        .filter((e) => e.__typename === type && set.has(e.delegator))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, first)
        .map(shapeEvent);
    return {
      bond: of("BondEvent"),
      unbond: of("UnbondEvent"),
      rebond: of("RebondEvent"),
      withdrawStake: of("WithdrawStakeEvent"),
      withdrawFees: of("WithdrawFeesEvent"),
    };
  },

  OrchestratorUpdates: ({ ids, since = 0 }) => {
    const set = new Set(lower(ids));
    return {
      transcoderUpdateEvents: f.events
        .filter(
          (e) =>
            e.__typename === "TranscoderUpdateEvent" &&
            set.has(e.delegate) &&
            e.timestamp >= Number(since)
        )
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 100)
        .map(shapeEvent),
    };
  },

  Governance: () => ({
    treasuryProposals: [...f.treasuryProposals]
      .sort((a, b) => Number(b.voteStart) - Number(a.voteStart))
      .map(({ proposer, ...p }) => ({ ...p, proposer: { id: proposer } })),
    polls: [...f.polls].sort((a, b) => Number(b.endBlock) - Number(a.endBlock)),
  }),
};

/* ── HTTP ────────────────────────────────────────────────────────────────── */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

const send = (res, status, body) => {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname.startsWith("/coingecko"))
    return send(res, 200, COINGECKO);
  if (req.method === "GET" && url.pathname === "/health")
    return send(res, 200, { ok: true, demo: f.demo });
  if (req.method !== "POST") return send(res, 404, { error: "not found" });

  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { errors: [{ message: "mock: invalid JSON" }] });
    }
    const op = /\b(?:query|mutation)\s+(\w+)/.exec(body.query ?? "")?.[1];
    const resolver = op && resolvers[op];
    if (!resolver) {
      console.warn(`[mock] unknown operation: ${op ?? "(anonymous)"}`);
      return send(res, 200, {
        errors: [{ message: `mock: unknown operation ${op ?? "(anonymous)"}` }],
      });
    }
    const t0 = performance.now();
    try {
      const data = resolver(body.variables ?? {});
      if (VERBOSE)
        console.log(
          `[mock] ${op} ${JSON.stringify(body.variables ?? {}).slice(
            0,
            120
          )} ${(performance.now() - t0).toFixed(1)}ms`
        );
      send(res, 200, { data });
    } catch (err) {
      console.error(`[mock] ${op} failed`, err);
      send(res, 200, {
        errors: [{ message: `mock: ${op} failed: ${err.message}` }],
      });
    }
  });
});

server.listen(PORT, () =>
  console.log(
    `[mock] subgraph on http://localhost:${PORT}/graphql, prices on /coingecko`
  )
);
