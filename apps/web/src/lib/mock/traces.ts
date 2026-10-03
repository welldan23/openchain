/**
 * Data tiruan fitur Telusur Antar Wallet selama fase frontend.
 *
 * Setiap langkah diambil dari transfer di `mock/flows.ts`, jadi jalur di sini
 * selalu cocok dengan halaman aliran dana. Semua nilai FIKTIF.
 */
import type { AddressFlow, FlowTransfer, TraceHop, WalletTrace } from "../types";
import { MOCK_FLOWS } from "./flows";
import { mockEvmAddress } from "./ids";

const MAX_HOPS = 4;

function flowNamed(name: string): AddressFlow {
  const flow = MOCK_FLOWS.find((item) => item.label?.name === name);
  if (!flow) throw new Error(`Data tiruan aliran dana "${name}" tidak ada.`);
  return flow;
}

/** Transfer dari sudut pandang `flow` diubah menjadi langkah pengirim → penerima. */
function hop(flow: AddressFlow, pick: (transfer: FlowTransfer) => boolean): TraceHop {
  const transfer = flow.transfers.find(pick);
  if (!transfer) throw new Error("Transfer untuk langkah jalur tiruan tidak ditemukan.");
  const owner = { address: flow.address, label: flow.label };
  const other = { address: transfer.counterparty, label: transfer.counterpartyLabel };
  const [from, to] = transfer.direction === "in" ? [other, owner] : [owner, other];
  return {
    from: from.address,
    fromLabel: from.label,
    to: to.address,
    toLabel: to.label,
    asset: transfer.asset,
    amount: transfer.amount,
    amountUsd: transfer.amountUsd,
    txHash: transfer.txHash,
    timestamp: transfer.timestamp,
  };
}

function trace(flow: AddressFlow, hops: TraceHop[]): WalletTrace {
  const first = hops[0];
  const last = hops[hops.length - 1];
  return {
    chain: flow.chain,
    from: first.from,
    fromLabel: first.fromLabel,
    to: last.to,
    toLabel: last.toLabel,
    maxHops: MAX_HOPS,
    hops,
    snapshot: flow.snapshot,
  };
}

const funder = flowNamed("Pendana bersama 5 wallet");
const kodoCreator = flowNamed("Pembuat KODO");

const bundler1 = mockEvmAddress("nbla:bundler-1");
const exchangeHot = mockEvmAddress("nbla:exchange-hot");
const exchangeDeposit = mockEvmAddress("flow:nbla-exchange-deposit");

const fromExchange = hop(funder, (t) => t.direction === "in" && t.counterparty === exchangeHot);
const toBundler1 = hop(funder, (t) => t.direction === "out" && t.counterparty === bundler1);
const backFromBundler1 = hop(funder, (t) => t.direction === "in" && t.counterparty === bundler1);
const toDeposit = hop(funder, (t) => t.direction === "out" && t.counterparty === exchangeDeposit);

const noPath: WalletTrace = {
  chain: "ethereum",
  from: bundler1,
  fromLabel: toBundler1.toLabel,
  to: mockEvmAddress("nbla:treasury"),
  toLabel: { type: "treasury", source: "heuristic", sourceName: "OpenChain heuristic" },
  maxHops: MAX_HOPS,
  hops: [],
  snapshot: funder.snapshot,
};

export const MOCK_TRACES: WalletTrace[] = [
  // Dari mana modal wallet bundler berasal.
  trace(funder, [fromExchange, toBundler1]),
  // Ke mana dana bundler mengalir setelah menjual.
  trace(funder, [backFromBundler1, toDeposit]),
  trace(kodoCreator, [
    hop(kodoCreator, (t) => t.direction === "in"),
    hop(kodoCreator, (t) => t.direction === "out"),
  ]),
  noPath,
];

/**
 * Jalur yang sengaja membuat API tiruan gagal, untuk mencoba tampilan status
 * gagal di halaman telusur.
 */
export const MOCK_FAILING_TRACE = {
  chain: "arbitrum",
  from: mockEvmAddress("demo:telusur-gagal-asal"),
  to: mockEvmAddress("demo:telusur-gagal-tujuan"),
} as const;
