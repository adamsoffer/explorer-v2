import { arbitrum, mainnet } from "viem/chains";

/**
 * The staging subgraph carries the fields the portfolio needs — delegator
 * `shares`, per-round `DelegatorSnapshot`s, and cumulative reward/fee factors
 * on every pool (livepeer/subgraph#217). Point this at the production gateway
 * once those land there.
 */
export const STAGING_SUBGRAPH_URL =
  "https://api.studio.thegraph.com/query/20534/livepeer-staging/version/latest";

const SUBGRAPH_KEY = process.env.NEXT_PUBLIC_SUBGRAPH_API_KEY;
const SUBGRAPH_ID = process.env.NEXT_PUBLIC_SUBGRAPH_ID;

export const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_ENDPOINT ||
  (SUBGRAPH_KEY && SUBGRAPH_ID
    ? `https://gateway.thegraph.com/api/${SUBGRAPH_KEY}/subgraphs/id/${SUBGRAPH_ID}`
    : STAGING_SUBGRAPH_URL);

export const WALLET_CONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";

const INFURA_KEY = process.env.NEXT_PUBLIC_INFURA_KEY;

export const L2_CHAIN = arbitrum;
export const L1_CHAIN = mainnet;

export const RPC_URLS: Record<number, string[]> = {
  [arbitrum.id]: [
    process.env.NEXT_PUBLIC_L2_RPC_URL,
    INFURA_KEY && `https://arbitrum-mainnet.infura.io/v3/${INFURA_KEY}`,
    "https://arb1.arbitrum.io/rpc",
  ].filter(Boolean) as string[],
  [mainnet.id]: [
    process.env.NEXT_PUBLIC_L1_RPC_URL,
    INFURA_KEY && `https://mainnet.infura.io/v3/${INFURA_KEY}`,
    // Keyless public endpoints; cloudflare-eth.com has been shut down.
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
  ].filter(Boolean) as string[],
};

export const CONTRACTS = {
  controller: "0xD8E8328501E9645d16Cf49539efC04f734606ee4",
  pollCreator: "0x8bb50806D60c492c0004DAD5D9627DAA2d9732E6",
} as const;

export const BLOCK_EXPLORER = "https://arbiscan.io";

export const txUrl = (hash: string) => `${BLOCK_EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) =>
  `${BLOCK_EXPLORER}/address/${address}`;
