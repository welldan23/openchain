/**
 * Data tiruan halaman Lacak Aliran Dana selama fase frontend.
 *
 * Address memakai seed yang sama dengan `mock/tokens.ts`, jadi ceritanya
 * nyambung dengan token Nebula Finance (NBLA) dan Kodo Cat (KODO). Semua
 * address, hash, dan nilai di sini FIKTIF.
 */
import type { AddressFlow, EntityLabel, FlowAsset, FlowTransfer } from "../types";
import {
  mockEvmAddress,
  mockEvmTxHash,
  mockSolanaAddress,
  mockSolanaSignature,
} from "./ids";

const SNAPSHOT_AT = "2026-10-03T04:30:00.000Z";
const ETH_USD = 2_450;
const SOL_USD = 182;
const NBLA_USD = 0.004213;

const ETH: FlowAsset = { symbol: "ETH", address: null };
const SOL: FlowAsset = { symbol: "SOL", address: null };
const NBLA: FlowAsset = { symbol: "NBLA", address: mockEvmAddress("nbla:token") };
/** Token kecil tanpa pool aktif, jadi harganya tidak diketahui. */
const XNEB: FlowAsset = { symbol: "XNEB", address: mockEvmAddress("flow:xneb-token") };

const EXCHANGE_LABEL: EntityLabel = {
  type: "exchange",
  name: "Hot wallet exchange",
  source: "external",
  sourceName: "Label publik explorer",
};

const BUNDLER_LABEL: EntityLabel = {
  type: "bot",
  name: "Kemungkinan bundler",
  source: "heuristic",
  sourceName: "OpenChain heuristic",
};

type TransferInput = Omit<FlowTransfer, "id">;

function withIds(prefix: string, transfers: TransferInput[]): FlowTransfer[] {
  return transfers.map((transfer, index) => ({ ...transfer, id: `${prefix}-${index + 1}` }));
}

/* -------------------------------------------------------------------------- */
/* Pendana bersama wallet bundler NBLA — Ethereum                              */
/* -------------------------------------------------------------------------- */

const nbla = {
  funder: mockEvmAddress("nbla:common-funder"),
  deployer: mockEvmAddress("nbla:deployer"),
  pool: mockEvmAddress("nbla:univ2-pool"),
  exchange: mockEvmAddress("nbla:exchange-hot"),
  exchangeDeposit: mockEvmAddress("flow:nbla-exchange-deposit"),
  bridge: mockEvmAddress("flow:nbla-bridge"),
  unknownSender: mockEvmAddress("flow:nbla-unknown-sender"),
  treasury: mockEvmAddress("nbla:treasury"),
  holder3: mockEvmAddress("nbla:holder-3"),
  bundlers: [
    mockEvmAddress("nbla:bundler-1"),
    mockEvmAddress("nbla:bundler-2"),
    mockEvmAddress("flow:nbla-bundler-3"),
    mockEvmAddress("flow:nbla-bundler-4"),
    mockEvmAddress("flow:nbla-bundler-5"),
  ],
};

const fundingTxSeeds = [
  "nbla:fund-bundler-1",
  "nbla:fund-bundler-2",
  "flow:nbla-fund-bundler-3",
  "flow:nbla-fund-bundler-4",
  "flow:nbla-fund-bundler-5",
];
const fundingAmounts = [2.1, 2.05, 2.2, 1.95, 2.0];
const fundingMinutes = ["58", "00", "02", "05", "07"];

const commonFunderFlow: AddressFlow = {
  chain: "ethereum",
  address: nbla.funder,
  label: {
    type: "unknown",
    name: "Pendana bersama 5 wallet",
    source: "heuristic",
    sourceName: "OpenChain heuristic",
  },
  window: { from: "2026-09-12T00:00:00.000Z", to: SNAPSHOT_AT },
  transfers: withIds("funder", [
    {
      direction: "in",
      counterparty: nbla.exchange,
      counterpartyLabel: EXCHANGE_LABEL,
      asset: ETH,
      amount: 12,
      amountUsd: 12 * ETH_USD,
      txHash: mockEvmTxHash("flow:funder-from-exchange"),
      timestamp: "2026-09-12T07:20:00.000Z",
    },
    {
      direction: "in",
      counterparty: nbla.unknownSender,
      asset: ETH,
      amount: 2.5,
      amountUsd: 2.5 * ETH_USD,
      txHash: mockEvmTxHash("flow:funder-from-unknown"),
      timestamp: "2026-09-12T07:31:00.000Z",
    },
    ...nbla.bundlers.map(
      (bundler, index): TransferInput => ({
        direction: "out",
        counterparty: bundler,
        counterpartyLabel: BUNDLER_LABEL,
        asset: ETH,
        amount: fundingAmounts[index],
        amountUsd: fundingAmounts[index] * ETH_USD,
        txHash: mockEvmTxHash(fundingTxSeeds[index]),
        // Lima pendanaan dalam rentang 9 menit sebelum likuiditas ditambahkan.
        timestamp: `2026-09-12T0${index === 0 ? 7 : 8}:${fundingMinutes[index]}:00.000Z`,
      }),
    ),
    {
      direction: "in",
      counterparty: nbla.bundlers[0],
      counterpartyLabel: BUNDLER_LABEL,
      asset: ETH,
      amount: 3.8,
      amountUsd: 3.8 * ETH_USD,
      txHash: mockEvmTxHash("flow:funder-back-from-bundler-1"),
      timestamp: "2026-09-20T13:42:00.000Z",
    },
    {
      direction: "in",
      counterparty: nbla.bundlers[1],
      counterpartyLabel: BUNDLER_LABEL,
      asset: ETH,
      amount: 2.9,
      amountUsd: 2.9 * ETH_USD,
      txHash: mockEvmTxHash("flow:funder-back-from-bundler-2"),
      timestamp: "2026-09-20T13:55:00.000Z",
    },
    {
      direction: "in",
      counterparty: nbla.bundlers[2],
      counterpartyLabel: BUNDLER_LABEL,
      asset: NBLA,
      amount: 4_200_000,
      amountUsd: 4_200_000 * NBLA_USD,
      txHash: mockEvmTxHash("flow:funder-nbla-from-bundler-3"),
      timestamp: "2026-09-21T02:10:00.000Z",
    },
    {
      direction: "out",
      counterparty: nbla.exchangeDeposit,
      counterpartyLabel: {
        type: "exchange",
        name: "Deposit exchange",
        source: "external",
        sourceName: "Label publik explorer",
      },
      asset: ETH,
      amount: 6,
      amountUsd: 6 * 2_510,
      txHash: mockEvmTxHash("flow:funder-to-exchange-deposit"),
      timestamp: "2026-09-22T09:03:00.000Z",
    },
    {
      direction: "out",
      counterparty: nbla.bridge,
      counterpartyLabel: {
        type: "bridge",
        name: "Bridge ke Base",
        source: "external",
        sourceName: "Label publik explorer",
      },
      asset: ETH,
      amount: 1.5,
      amountUsd: 1.5 * 2_510,
      txHash: mockEvmTxHash("flow:funder-to-bridge"),
      timestamp: "2026-09-22T09:20:00.000Z",
    },
    {
      direction: "in",
      counterparty: nbla.unknownSender,
      asset: XNEB,
      amount: 50_000,
      txHash: mockEvmTxHash("flow:funder-xneb-airdrop"),
      timestamp: "2026-09-25T18:00:00.000Z",
    },
  ]),
  snapshot: {
    fetchedAt: SNAPSHOT_AT,
    blockNumber: 23_512_880,
    sources: ["Node RPC (tiruan)", "Label publik explorer (tiruan)"],
  },
};

/* -------------------------------------------------------------------------- */
/* Deployer NBLA — Ethereum                                                    */
/* -------------------------------------------------------------------------- */

const deployerFlow: AddressFlow = {
  chain: "ethereum",
  address: nbla.deployer,
  label: { type: "deployer", name: "Deployer NBLA", source: "heuristic", sourceName: "OpenChain heuristic" },
  window: { from: "2026-09-12T00:00:00.000Z", to: SNAPSHOT_AT },
  transfers: withIds("deployer", [
    {
      direction: "in",
      counterparty: nbla.exchange,
      counterpartyLabel: EXCHANGE_LABEL,
      asset: ETH,
      amount: 10,
      amountUsd: 10 * ETH_USD,
      txHash: mockEvmTxHash("nbla:deployer-funding"),
      timestamp: "2026-09-12T07:05:00.000Z",
    },
    {
      // Sebelum likuiditas ditambahkan, NBLA belum punya harga pasar.
      direction: "out",
      counterparty: nbla.treasury,
      counterpartyLabel: { type: "treasury", source: "heuristic", sourceName: "OpenChain heuristic" },
      asset: NBLA,
      amount: 100_000_000,
      txHash: mockEvmTxHash("flow:deployer-to-treasury"),
      timestamp: "2026-09-12T08:20:00.000Z",
    },
    {
      direction: "out",
      counterparty: nbla.pool,
      counterpartyLabel: {
        type: "liquidity_pool",
        name: "Uniswap V2: NBLA/WETH",
        source: "external",
        sourceName: "DEX indexer",
      },
      asset: ETH,
      amount: 5,
      amountUsd: 5 * ETH_USD,
      txHash: mockEvmTxHash("nbla:add-liquidity"),
      timestamp: "2026-09-12T08:31:00.000Z",
    },
    {
      direction: "out",
      counterparty: nbla.pool,
      counterpartyLabel: {
        type: "liquidity_pool",
        name: "Uniswap V2: NBLA/WETH",
        source: "external",
        sourceName: "DEX indexer",
      },
      asset: NBLA,
      amount: 400_000_000,
      amountUsd: 400_000_000 * 0.0000306,
      txHash: mockEvmTxHash("nbla:add-liquidity"),
      timestamp: "2026-09-12T08:31:00.000Z",
    },
    {
      direction: "out",
      counterparty: nbla.holder3,
      asset: NBLA,
      amount: 5_000_000,
      amountUsd: 5_000_000 * NBLA_USD,
      txHash: mockEvmTxHash("nbla:transfer-holder-3"),
      timestamp: "2026-09-18T11:47:00.000Z",
    },
  ]),
  snapshot: {
    fetchedAt: SNAPSHOT_AT,
    blockNumber: 23_512_880,
    sources: ["Node RPC (tiruan)", "DEX indexer (tiruan)", "Label publik explorer (tiruan)"],
  },
};

/* -------------------------------------------------------------------------- */
/* Pembuat KODO — Solana                                                       */
/* -------------------------------------------------------------------------- */

const kodo = {
  creator: mockSolanaAddress("kodo:creator"),
  exchange: mockSolanaAddress("flow:kodo-exchange-hot"),
  bundlers: [
    mockSolanaAddress("kodo:bundler-1"),
    mockSolanaAddress("kodo:bundler-2"),
    mockSolanaAddress("kodo:bundler-3"),
  ],
};

const kodoCreatorFlow: AddressFlow = {
  chain: "solana",
  address: kodo.creator,
  label: { type: "deployer", name: "Pembuat KODO", source: "heuristic", sourceName: "OpenChain heuristic" },
  window: { from: "2026-09-28T00:00:00.000Z", to: SNAPSHOT_AT },
  transfers: withIds("kodo-creator", [
    {
      direction: "in",
      counterparty: kodo.exchange,
      counterpartyLabel: EXCHANGE_LABEL,
      asset: SOL,
      amount: 60,
      amountUsd: 60 * SOL_USD,
      txHash: mockSolanaSignature("flow:kodo-creator-from-exchange"),
      timestamp: "2026-09-28T03:12:00.000Z",
    },
    ...kodo.bundlers.map(
      (bundler, index): TransferInput => ({
        direction: "out",
        counterparty: bundler,
        counterpartyLabel: BUNDLER_LABEL,
        asset: SOL,
        amount: 12 + index,
        amountUsd: (12 + index) * SOL_USD,
        txHash: mockSolanaSignature(`flow:kodo-fund-bundler-${index + 1}`),
        timestamp: `2026-09-28T03:2${index}:00.000Z`,
      }),
    ),
  ]),
  snapshot: {
    fetchedAt: SNAPSHOT_AT,
    blockNumber: 371_204_551,
    sources: ["Node RPC (tiruan)", "Label publik explorer (tiruan)"],
  },
};

/* -------------------------------------------------------------------------- */
/* Wallet baru tanpa transfer — Base                                           */
/* -------------------------------------------------------------------------- */

const emptyWalletFlow: AddressFlow = {
  chain: "base",
  address: mockEvmAddress("flow:wallet-baru"),
  window: { from: "2026-09-03T00:00:00.000Z", to: SNAPSHOT_AT },
  transfers: [],
  snapshot: {
    fetchedAt: SNAPSHOT_AT,
    blockNumber: 36_118_402,
    sources: ["Node RPC (tiruan)"],
  },
};

/* -------------------------------------------------------------------------- */
/* Pendana bersama yang sama di Base, setelah dana di-bridge dari Ethereum      */
/* -------------------------------------------------------------------------- */

const commonFunderBaseFlow: AddressFlow = {
  chain: "base",
  address: nbla.funder,
  label: commonFunderFlow.label,
  window: { from: "2026-09-12T00:00:00.000Z", to: SNAPSHOT_AT },
  transfers: withIds("funder-base", [
    {
      direction: "in",
      counterparty: mockEvmAddress("flow:base-bridge"),
      counterpartyLabel: {
        type: "bridge",
        name: "Bridge dari Ethereum",
        source: "external",
        sourceName: "Label publik explorer",
      },
      asset: ETH,
      amount: 1.4985,
      amountUsd: 1.4985 * 2_510,
      txHash: mockEvmTxHash("flow:base-funder-from-bridge"),
      timestamp: "2026-09-22T09:31:00.000Z",
    },
    {
      direction: "out",
      counterparty: mockEvmAddress("flow:base-dex-router"),
      counterpartyLabel: { type: "router", name: "Router DEX", source: "external", sourceName: "DEX indexer" },
      asset: ETH,
      amount: 1.2,
      amountUsd: 1.2 * 2_495,
      txHash: mockEvmTxHash("flow:base-funder-to-router"),
      timestamp: "2026-09-30T22:15:00.000Z",
    },
    {
      direction: "out",
      counterparty: mockEvmAddress("flow:base-fresh-wallet"),
      asset: ETH,
      amount: 0.25,
      amountUsd: 0.25 * 2_450,
      txHash: mockEvmTxHash("flow:base-funder-to-fresh-wallet"),
      timestamp: "2026-10-02T23:40:00.000Z",
    },
  ]),
  snapshot: {
    fetchedAt: SNAPSHOT_AT,
    blockNumber: 36_118_402,
    sources: ["Node RPC (tiruan)", "DEX indexer (tiruan)", "Label publik explorer (tiruan)"],
  },
};

export const MOCK_FLOWS: AddressFlow[] = [
  commonFunderFlow,
  deployerFlow,
  kodoCreatorFlow,
  emptyWalletFlow,
  commonFunderBaseFlow,
];

/**
 * Address yang sengaja membuat API tiruan gagal, untuk mencoba tampilan
 * status gagal di halaman aliran dana.
 */
export const MOCK_FAILING_FLOW = {
  chain: "arbitrum",
  address: mockEvmAddress("demo:aliran-gagal-dimuat"),
} as const;
