# Livepeer Explorer

![Node.js](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)
![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10.33.0-blue)

The Livepeer Explorer is where LPT holders manage their stake. The default
view is a **portfolio**: stake, rewards and fees for every wallet you care
about, reconstructed round by round, with early warnings when an orchestrator
slips. Around it sit the orchestrator directory, network health, governance
and a live activity feed.

## What's in it

| Route                      | What it's for                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/`                        | Portfolio for the connected wallet plus any addresses you track (read-only, stored in the browser). Onboarding when there are none. |
| `/accounts/[address]`      | The same portfolio view for any single address.                                                                                     |
| `/orchestrators`           | Active set with realised delegator APR, reward-call reliability, cuts, fees and a stake-size estimator.                             |
| `/orchestrators/[address]` | Profile, per-round yield / stake / fee charts, reward-call history, cut history, delegators.                                        |
| `/network`                 | Round clock, participation, inflation, fee volume.                                                                                  |
| `/governance`              | Treasury proposals and LIP polls, with voting.                                                                                      |
| `/activity`                | Protocol events as they happen.                                                                                                     |

Staking actions (delegate, stake more, move, unstake, restake, withdraw stake,
withdraw fees) run in a single dialog flow from wherever they're relevant.

## How the portfolio numbers are computed

The explorer reads the Livepeer **staging subgraph**
(`livepeer/subgraph#217`), which adds delegator `shares`, per-event
`DelegatorSnapshot`s, and cumulative reward/fee factors on every pool. With
those, history is exact rather than estimated:

```
stake[r]  = shares[r]   · CRF[r] / 1e27
reward[r] = shares[r-1] · (CRF[r] − CRF[r-1]) / 1e27
fees[r]   = shares[r-1] · (CFF[r] − CFF[r-1]) / 1e27
```

Rewards come from factor growth, never balance differences, so bonding,
unbonding and moving stake are never mistaken for earnings. Self-delegated
orchestrators also get their reward-cut commission reconstructed. See
`lib/portfolio/compute.ts` and its tests.

"Realised APR" everywhere is the yield actually paid over the last 30 rounds,
compounded to a year, not a projection from protocol parameters.

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4 with the Livepeer Design System tokens (`app/globals.css`),
  from the Livepeer UI registry (`livepeer.peaceno.de`)
- Base UI primitives in `components/ui`, Lucide icons, Motion
- TanStack Query over plain GraphQL `fetch` (`lib/subgraph`)
- wagmi + viem + RainbowKit for wallets and transactions
- Recharts for charts

## Getting started

```bash
pnpm install
cp .env.example .env   # all values are optional
pnpm dev
```

With no environment set, the app uses the staging subgraph and public RPCs.

### Environment

| Variable                                                                     | Purpose                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_SUBGRAPH_ENDPOINT`                                              | Full subgraph URL. Overrides the next two.             |
| `NEXT_PUBLIC_SUBGRAPH_API_KEY`, `NEXT_PUBLIC_SUBGRAPH_ID`                    | Graph gateway key and subgraph id.                     |
| `NEXT_PUBLIC_INFURA_KEY`, `NEXT_PUBLIC_L1_RPC_URL`, `NEXT_PUBLIC_L2_RPC_URL` | RPC endpoints (Arbitrum for staking, mainnet for ENS). |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`                                      | WalletConnect project.                                 |

## Scripts

| Command                     |                                      |
| --------------------------- | ------------------------------------ |
| `pnpm dev`                  | Dev server                           |
| `pnpm build` / `pnpm start` | Production build / serve             |
| `pnpm lint`                 | ESLint, zero warnings                |
| `pnpm typecheck`            | `tsc --noEmit`                       |
| `pnpm test`                 | Jest (portfolio math, staking hints) |

`scripts/mock` contains a local mock of the subgraph and a Playwright
screenshot script for working on the UI offline.

## Design conventions

These follow the Livepeer Design System so Livepeer products feel like one
family:

- **Ink and paper.** Neutral surfaces; Livepeer green is an accent for status,
  liveness, positive deltas and focus — never a button fill.
- **One primary action per panel**; everything else is outline or ghost.
- **Section titles sit above cards**, not inside them.
- **Sans for language, mono for quantity.** Figures in columns use
  `font-mono tabular-nums`; the hero number uses proportional figures.
- **Charts:** fixed series colours (`--series-1…7`), 2px lines, hairline
  grids, no legend for a single series, never a second y-axis.
- **Honest UI:** no invented numbers — unknown values render as "—".

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
