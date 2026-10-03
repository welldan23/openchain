/**
 * Data tiruan halaman Jelajah Multichain selama fase frontend.
 *
 * Aktivitas pendana bersama di Ethereum dan Base dihitung dari
 * `mock/flows.ts`, jadi angkanya cocok dengan halaman aliran dana. Semua
 * address, hash, dan nilai di sini FIKTIF.
 */
import { CHAINS } from "../chains";
import { summarizeFlow } from "../fund-flow";
import type {
  BridgeMove,
  ChainActivity,
  ChainId,
  CrossChainActivity,
  EntityLabel,
  MultichainProfile,
} from "../types";
import { MOCK_FLOWS } from "./flows";
import { mockEvmAddress, mockEvmTxHash } from "./ids";

const SNAPSHOT_AT = "2026-10-03T04:30:00.000Z";
const WINDOW = { from: "2026-09-03T00:00:00.000Z", to: SNAPSHOT_AT };
const SOURCES = ["Node RPC tiap chain (tiruan)", "Label publik explorer (tiruan)"];

/** Blok snapshot tiap chain EVM. */
const SNAPSHOT_BLOCKS: Record<Exclude<ChainId, "solana">, number> = {
  ethereum: 23_512_880,
  bsc: 62_480_115,
  base: 36_118_402,
  arbitrum: 389_220_504,
};

const EVM_CHAINS = (Object.keys(CHAINS) as ChainId[]).filter(
  (chain): chain is Exclude<ChainId, "solana"> => CHAINS[chain].addressFormat === "evm",
);

const ETH: BridgeMove["asset"] = { symbol: "ETH", address: null };

function inactive(chain: Exclude<ChainId, "solana">): ChainActivity {
  return { chain, txCount: 0, inUsd: 0, outUsd: 0, counterpartyCount: 0, balanceUsd: 0, snapshotBlock: SNAPSHOT_BLOCKS[chain] };
}

/** Aktivitas dari data aliran dana; chain tanpa data dianggap tidak aktif. */
function activityFromFlows(address: string, balances: Partial<Record<ChainId, number>>): ChainActivity[] {
  return EVM_CHAINS.map((chain) => {
    const flow = MOCK_FLOWS.find((item) => item.chain === chain && item.address === address);
    if (!flow || flow.transfers.length === 0) return inactive(chain);
    const totals = summarizeFlow(chain, flow.transfers);
    const times = flow.transfers.map((transfer) => transfer.timestamp).sort();
    return {
      chain,
      txCount: new Set(flow.transfers.map((transfer) => transfer.txHash)).size,
      inUsd: totals.inUsd,
      outUsd: totals.outUsd,
      counterpartyCount: totals.counterpartyCount,
      firstSeen: times[0],
      lastSeen: times[times.length - 1],
      balanceUsd: balances[chain] ?? 0,
      snapshotBlock: SNAPSHOT_BLOCKS[chain],
    };
  });
}

/**
 * Linimasa dari data aliran dana. Transfer yang hash-nya sama dengan kaki
 * kiriman atau penerimaan bridge ditandai sebagai aktivitas bridge.
 */
function activitiesFromFlows(address: string, bridges: BridgeMove[]): CrossChainActivity[] {
  return MOCK_FLOWS.filter((flow) => flow.address === address).flatMap((flow) =>
    flow.transfers.map((transfer): CrossChainActivity => {
      const sent = bridges.find((move) => move.sentTxHash === transfer.txHash);
      const received = bridges.find((move) => move.receivedTxHash === transfer.txHash);
      return {
        id: `${flow.chain}:${transfer.id}`,
        chain: flow.chain,
        kind: sent ? "bridge_out" : received ? "bridge_in" : transfer.direction,
        timestamp: transfer.timestamp,
        counterparty: transfer.counterparty,
        counterpartyLabel: transfer.counterpartyLabel,
        asset: transfer.asset,
        amount: transfer.amount,
        amountUsd: transfer.amountUsd,
        txHash: transfer.txHash,
        bridgeId: (sent ?? received)?.id,
      };
    }),
  );
}

function bridgeLabel(name: string): EntityLabel {
  return { type: "bridge", name, source: "external", sourceName: "Label publik explorer" };
}

/* -------------------------------------------------------------------------- */
/* Pendana bersama wallet bundler NBLA — aktif di Ethereum dan Base            */
/* -------------------------------------------------------------------------- */

const funderAddress = mockEvmAddress("nbla:common-funder");

const funderBridges: BridgeMove[] = [
  {
    id: "funder-eth-base",
    fromChain: "ethereum",
    toChain: "base",
    bridge: bridgeLabel("Bridge ke Base"),
    asset: ETH,
    amountSent: 1.5,
    amountReceived: 1.4985,
    amountUsd: 1.5 * 2_510,
    sentTxHash: mockEvmTxHash("flow:funder-to-bridge"),
    sentAt: "2026-09-22T09:20:00.000Z",
    receivedTxHash: mockEvmTxHash("flow:base-funder-from-bridge"),
    receivedAt: "2026-09-22T09:31:00.000Z",
    status: "matched",
  },
];

const funderProfile: MultichainProfile = {
  address: funderAddress,
  label: { type: "unknown", name: "Pendana bersama 5 wallet", source: "heuristic", sourceName: "OpenChain heuristic" },
  window: WINDOW,
  // Sisa saldo ETH dihitung dari transfer: 3,4 ETH di Ethereum dan 0,0485 ETH di Base.
  chains: activityFromFlows(funderAddress, { ethereum: 3.4 * 2_450, base: 0.0485 * 2_450 }),
  bridges: funderBridges,
  activities: activitiesFromFlows(funderAddress, funderBridges),
  fetchedAt: SNAPSHOT_AT,
  sources: SOURCES,
};

/* -------------------------------------------------------------------------- */
/* Wallet aktif di empat chain                                                 */
/* -------------------------------------------------------------------------- */

const busyAddress = mockEvmAddress("multi:market-maker");

const busyExchange: EntityLabel = { type: "exchange", name: "Hot wallet exchange", source: "external", sourceName: "Label publik explorer" };
const busyRouter: EntityLabel = { type: "router", name: "Router DEX", source: "external", sourceName: "DEX indexer" };
const USDC = { symbol: "USDC", address: mockEvmAddress("multi:usdc") };

function busyActivity(
  id: string,
  chain: Exclude<ChainId, "solana">,
  kind: CrossChainActivity["kind"],
  timestamp: string,
  counterpartySeed: string,
  amount: number,
  amountUsd: number,
  options: { label?: EntityLabel; asset?: CrossChainActivity["asset"]; bridgeId?: string; txSeed?: string } = {},
): CrossChainActivity {
  return {
    id,
    chain,
    kind,
    timestamp,
    counterparty: mockEvmAddress(counterpartySeed),
    counterpartyLabel: options.label,
    asset: options.asset ?? ETH,
    amount,
    amountUsd,
    txHash: mockEvmTxHash(options.txSeed ?? `multi:activity:${id}`),
    bridgeId: options.bridgeId,
  };
}

const busyActivities: CrossChainActivity[] = [
  busyActivity("eth-1", "ethereum", "in", "2026-09-03T02:10:00.000Z", "multi:exchange-hot", 120, 120 * 2_420, { label: busyExchange }),
  busyActivity("bsc-1", "bsc", "in", "2026-09-05T11:42:00.000Z", "multi:exchange-hot-bsc", 60_000, 60_000, { label: busyExchange, asset: USDC }),
  busyActivity("base-1", "base", "in", "2026-09-08T07:30:00.000Z", "multi:base-funder", 15, 15 * 2_440),
  busyActivity("eth-bridge", "ethereum", "bridge_out", "2026-09-14T14:48:00.000Z", "multi:bridge-arb", 20, 20 * 2_470, {
    label: bridgeLabel("Bridge resmi Arbitrum"),
    bridgeId: "busy-eth-arb",
    txSeed: "multi:eth-arb-sent",
  }),
  busyActivity("arb-bridge", "arbitrum", "bridge_in", "2026-09-14T15:05:00.000Z", "multi:bridge-arb-l2", 20, 20 * 2_470, {
    label: bridgeLabel("Bridge resmi Arbitrum"),
    bridgeId: "busy-eth-arb",
    txSeed: "multi:eth-arb-received",
  }),
  busyActivity("arb-1", "arbitrum", "out", "2026-09-16T09:12:00.000Z", "multi:router-arb", 6, 6 * 2_480, { label: busyRouter }),
  busyActivity("eth-2", "ethereum", "out", "2026-09-21T18:40:00.000Z", "multi:router-eth", 35, 35 * 2_500, { label: busyRouter }),
  busyActivity("bsc-bridge", "bsc", "bridge_out", "2026-09-27T10:12:00.000Z", "multi:bridge-bsc", 25_000, 25_000, {
    label: bridgeLabel("Bridge lintas chain"),
    asset: USDC,
    bridgeId: "busy-bsc-base",
    txSeed: "multi:bsc-base-sent",
  }),
  busyActivity("base-2", "base", "out", "2026-09-29T13:05:00.000Z", "multi:router-base", 4, 4 * 2_460, { label: busyRouter }),
  busyActivity("bsc-2", "bsc", "out", "2026-10-02T21:15:00.000Z", "multi:exchange-deposit-bsc", 18_000, 18_000, {
    label: { ...busyExchange, name: "Deposit exchange" },
    asset: USDC,
  }),
  busyActivity("base-bridge", "base", "bridge_out", "2026-10-03T03:40:00.000Z", "multi:bridge-base", 8, 8 * 2_450, {
    label: bridgeLabel("Bridge ke Ethereum"),
    bridgeId: "busy-base-eth",
    txSeed: "multi:base-eth-sent",
  }),
  busyActivity("eth-3", "ethereum", "in", "2026-10-03T03:58:00.000Z", "multi:exchange-hot", 10, 10 * 2_450, { label: busyExchange }),
];

const busyProfile: MultichainProfile = {
  address: busyAddress,
  label: { type: "market_maker", name: "Kemungkinan market maker", source: "heuristic", sourceName: "OpenChain heuristic" },
  window: WINDOW,
  chains: [
    {
      chain: "ethereum",
      txCount: 142,
      inUsd: 1_284_500,
      outUsd: 1_201_300,
      counterpartyCount: 38,
      firstSeen: "2026-09-03T02:10:00.000Z",
      lastSeen: "2026-10-03T03:58:00.000Z",
      balanceUsd: 96_400,
      snapshotBlock: SNAPSHOT_BLOCKS.ethereum,
    },
    {
      chain: "bsc",
      txCount: 88,
      inUsd: 412_800,
      outUsd: 455_100,
      counterpartyCount: 21,
      firstSeen: "2026-09-05T11:42:00.000Z",
      lastSeen: "2026-10-02T21:15:00.000Z",
      balanceUsd: 18_250,
      snapshotBlock: SNAPSHOT_BLOCKS.bsc,
    },
    {
      chain: "base",
      txCount: 65,
      inUsd: 298_400,
      outUsd: 251_900,
      counterpartyCount: 17,
      firstSeen: "2026-09-08T07:30:00.000Z",
      lastSeen: "2026-10-03T03:40:00.000Z",
      balanceUsd: 52_700,
      snapshotBlock: SNAPSHOT_BLOCKS.base,
    },
    {
      chain: "arbitrum",
      txCount: 31,
      inUsd: 120_600,
      outUsd: 118_900,
      counterpartyCount: 9,
      firstSeen: "2026-09-14T15:05:00.000Z",
      lastSeen: "2026-09-30T19:22:00.000Z",
      balanceUsd: 4_100,
      snapshotBlock: SNAPSHOT_BLOCKS.arbitrum,
    },
  ],
  bridges: [
    {
      id: "busy-eth-arb",
      fromChain: "ethereum",
      toChain: "arbitrum",
      bridge: bridgeLabel("Bridge resmi Arbitrum"),
      asset: ETH,
      amountSent: 20,
      amountReceived: 20,
      amountUsd: 20 * 2_470,
      sentTxHash: mockEvmTxHash("multi:eth-arb-sent"),
      sentAt: "2026-09-14T14:48:00.000Z",
      receivedTxHash: mockEvmTxHash("multi:eth-arb-received"),
      receivedAt: "2026-09-14T15:05:00.000Z",
      status: "matched",
    },
    {
      id: "busy-bsc-base",
      fromChain: "bsc",
      toChain: "base",
      bridge: bridgeLabel("Bridge lintas chain"),
      asset: { symbol: "USDC", address: mockEvmAddress("multi:usdc-bsc") },
      amountSent: 25_000,
      amountUsd: 25_000,
      sentTxHash: mockEvmTxHash("multi:bsc-base-sent"),
      sentAt: "2026-09-27T10:12:00.000Z",
      status: "unmatched",
    },
    {
      id: "busy-base-eth",
      fromChain: "base",
      toChain: "ethereum",
      bridge: bridgeLabel("Bridge ke Ethereum"),
      asset: ETH,
      amountSent: 8,
      amountUsd: 8 * 2_450,
      sentTxHash: mockEvmTxHash("multi:base-eth-sent"),
      sentAt: "2026-10-03T03:40:00.000Z",
      status: "pending",
    },
  ],
  activities: busyActivities,
  fetchedAt: SNAPSHOT_AT,
  sources: SOURCES,
};

/* -------------------------------------------------------------------------- */
/* Wallet yang belum aktif di chain mana pun                                    */
/* -------------------------------------------------------------------------- */

const quietProfile: MultichainProfile = {
  address: mockEvmAddress("flow:wallet-baru"),
  window: WINDOW,
  chains: EVM_CHAINS.map(inactive),
  bridges: [],
  activities: [],
  fetchedAt: SNAPSHOT_AT,
  sources: SOURCES,
};

export const MOCK_MULTICHAIN: MultichainProfile[] = [funderProfile, busyProfile, quietProfile];

/** Address yang sengaja membuat API tiruan gagal, untuk mencoba tampilan error. */
export const MOCK_FAILING_MULTICHAIN = mockEvmAddress("demo:multichain-gagal");
