/**
 * Penilaian risiko objek tiruan selama fase frontend. Dibangun dari data
 * tiruan halaman lain (token, aliran dana, peta), jadi hash bukti dan tautan
 * membuka sesuatu yang memang ada. Semua nilai FIKTIF.
 */
import { flowPath } from "../api/flows";
import { mapPath } from "../api/maps";
import { multichainPath } from "../api/multichain";
import { tokenPath } from "../api/tokens";
import { evidenceFromTransfers, mergeEvidence } from "../evidence";
import type { AddressFlow, ObjectRisk, RiskReason } from "../types";
import { MOCK_FLOWS } from "./flows";
import { mockEvmAddress, mockEvmTxHash } from "./ids";
import { MOCK_TOKENS } from "./tokens";

const SNAPSHOT_AT = "2026-10-03T04:30:00.000Z";
const [funderFlow, deployerFlow, , emptyWalletFlow, funderBaseFlow] = MOCK_FLOWS;
const [nblaToken] = MOCK_TOKENS;

function flowEvidence(...flows: AddressFlow[]) {
  return mergeEvidence(...flows.map((flow) => evidenceFromTransfers(flow.chain, { address: flow.address, label: flow.label }, flow.transfers)));
}

/** Hash transaksi dari transfer aliran dana tiruan, dicari lewat seed-nya. */
function tx(seed: string): string {
  return mockEvmTxHash(seed);
}

/* -------------------------------------------------------------------------- */
/* Token NBLA — Ethereum                                                       */
/* -------------------------------------------------------------------------- */

const TOKEN_POINTS: Record<string, number | null> = {
  "nbla-owner-tax": 25,
  "nbla-concentration": 20,
  "nbla-common-funding": 15,
  "nbla-deployer-funding": 8,
  // Klaim tanpa bukti on-chain tidak ikut dihitung ke skor.
  "nbla-liquidity-lock": null,
};

const nblaRisk: ObjectRisk = {
  kind: "token",
  chain: nblaToken.token.chain,
  address: nblaToken.token.address,
  title: `${nblaToken.token.name} (${nblaToken.token.symbol})`,
  score: nblaToken.risk.score,
  level: nblaToken.risk.level,
  reasons: nblaToken.risk.findings.map(
    (finding): RiskReason => ({ ...finding, points: TOKEN_POINTS[finding.id] ?? null }),
  ),
  warnings: [
    {
      id: "nbla-tax-raised",
      trait: "tax_change",
      title: "Pajak jual baru saja dinaikkan",
      description:
        "Owner menaikkan pajak jual dari 2% ke 5%. Kenaikan bertahap sering mendahului pajak yang jauh lebih tinggi, jadi pantau transaksi owner berikutnya.",
      severity: "high",
      classification: "fact",
      detectedAt: "2026-10-02T21:14:00.000Z",
      evidenceTxHashes: [tx("nbla:set-tax")],
    },
    {
      id: "nbla-funder-new-wallet",
      trait: "fresh_wallet_funding",
      title: "Pendana bundler mulai mendanai wallet baru di Base",
      description:
        "Address yang dulu mendanai lima wallet bundler mengirim ETH ke wallet baru di Base. Belum tentu terkait NBLA, tapi polanya sama dengan sebelum peluncuran.",
      severity: "medium",
      classification: "heuristic",
      detectedAt: "2026-10-02T23:40:00.000Z",
      evidenceTxHashes: [tx("flow:base-funder-to-fresh-wallet")],
    },
  ],
  traitChecks: [
    { trait: "tax_change", status: "detected", warningId: "nbla-tax-raised" },
    { trait: "mint_active", status: "clear", note: "Tidak ada fungsi mint setelah deploy di kode terverifikasi." },
    { trait: "sell_blocked", status: "unknown", note: "Simulasi jual belum dijalankan, jadi belum bisa dipastikan token bisa dijual." },
    { trait: "blacklist", status: "detected", note: "Fungsi blacklist ada di kode terverifikasi dan bisa dipanggil owner; belum pernah dipakai." },
    { trait: "upgradeable", status: "clear", note: "Bukan proxy, kode tidak bisa diganti." },
    { trait: "liquidity_unlocked", status: "unknown", note: "Diklaim terkunci 12 bulan, tapi transaksi penguncian belum ditemukan." },
    { trait: "liquidity_pulled", status: "clear", note: "Likuiditas pool belum pernah ditarik sejak ditambahkan." },
    { trait: "holder_concentration", status: "detected", reasonId: "nbla-concentration" },
    { trait: "bundled_launch", status: "detected", reasonId: "nbla-common-funding" },
    { trait: "fresh_wallet_funding", status: "detected", warningId: "nbla-funder-new-wallet" },
  ],
  labels: [],
  evidence: flowEvidence(deployerFlow, funderFlow, funderBaseFlow),
  links: [
    { kind: "token", title: "Investigasi token", href: tokenPath(nblaToken.token.chain, nblaToken.token.address) },
    { kind: "map", title: "Peta hubungan holder", href: mapPath(nblaToken.token.chain, nblaToken.token.address) },
  ],
  snapshot: {
    fetchedAt: SNAPSHOT_AT,
    blockNumber: nblaToken.snapshot.blockNumber,
    sources: nblaToken.snapshot.sources,
    dataStatus: "partial",
    statusReason: "Label holder dari explorer belum lengkap; sebagian holder besar belum punya label.",
  },
};

/* -------------------------------------------------------------------------- */
/* Pendana bersama wallet bundler — Ethereum                                   */
/* -------------------------------------------------------------------------- */

const funderRisk: ObjectRisk = {
  kind: "wallet",
  chain: funderFlow.chain,
  address: funderFlow.address,
  title: funderFlow.label?.name ?? "Wallet",
  score: 45,
  level: "medium",
  reasons: [
    {
      id: "funder-batch-funding",
      title: "Mendanai 5 wallet dalam 9 menit sebelum peluncuran NBLA",
      description:
        "Kelima wallet menerima ETH dengan nominal mirip (1,95–2,2 ETH), lalu membeli NBLA di blok yang sama dengan penambahan likuiditas. Polanya mirip bundler, tapi belum pasti dioperasikan pihak yang sama.",
      severity: "high",
      classification: "heuristic",
      points: 20,
      evidenceTxHashes: [tx("nbla:fund-bundler-1"), tx("nbla:fund-bundler-2"), tx("flow:nbla-fund-bundler-3")],
    },
    {
      id: "funder-funds-returned",
      title: "Dana dan token kembali dari wallet yang didanai",
      description: "Dua wallet mengembalikan ETH dan satu wallet mengirim 4,2 juta NBLA ke address ini setelah peluncuran.",
      severity: "medium",
      classification: "fact",
      points: 12,
      evidenceTxHashes: [tx("flow:funder-back-from-bundler-1"), tx("flow:funder-nbla-from-bundler-3")],
    },
    {
      id: "funder-exchange-source",
      title: "Modal awal dari hot wallet exchange",
      description: "Dana pertama berasal dari address yang dilabeli hot wallet exchange oleh label publik explorer.",
      severity: "low",
      classification: "external_label",
      points: 5,
      evidenceTxHashes: [tx("flow:funder-from-exchange")],
    },
    {
      id: "funder-bridge-out",
      title: "Sebagian dana dipindah ke Base lewat bridge",
      description: "1,5 ETH dikirim ke kontrak bridge, lalu 1,4985 ETH diterima address yang sama di Base.",
      severity: "low",
      classification: "calculation",
      points: 8,
      evidenceTxHashes: [tx("flow:funder-to-bridge"), tx("flow:base-funder-from-bridge")],
    },
  ],
  warnings: [
    {
      id: "funder-fresh-wallet",
      trait: "fresh_wallet_funding",
      title: "Mendanai wallet baru di Base",
      description: "Kiriman 0,25 ETH ke wallet yang belum punya riwayat. Pola yang sama muncul sebelum peluncuran NBLA.",
      severity: "medium",
      classification: "heuristic",
      detectedAt: "2026-10-02T23:40:00.000Z",
      evidenceTxHashes: [tx("flow:base-funder-to-fresh-wallet")],
    },
    {
      id: "funder-exchange-deposit",
      trait: "exchange_cashout",
      title: "Setoran ke deposit exchange",
      description: "6 ETH dikirim ke address deposit exchange. Bisa jadi dana dicairkan; asal penerimanya di exchange tidak terlihat on-chain.",
      severity: "low",
      classification: "external_label",
      detectedAt: "2026-09-22T09:03:00.000Z",
      evidenceTxHashes: [tx("flow:funder-to-exchange-deposit")],
    },
  ],
  traitChecks: [
    { trait: "bundled_launch", status: "detected", reasonId: "funder-batch-funding" },
    { trait: "fresh_wallet_funding", status: "detected", warningId: "funder-fresh-wallet" },
    { trait: "exchange_cashout", status: "detected", warningId: "funder-exchange-deposit" },
    { trait: "bridge_hop", status: "detected", reasonId: "funder-bridge-out" },
  ],
  labels: [
    {
      ...funderFlow.label!,
      confidence: 0.72,
      basis: "Mendanai lima wallet yang kemudian membeli NBLA di blok yang sama.",
      addedAt: "2026-09-12T09:00:00.000Z",
      evidenceTxHashes: [tx("nbla:fund-bundler-1"), tx("nbla:fund-bundler-2")],
    },
    {
      type: "bot",
      name: "Kemungkinan operator bundler",
      source: "heuristic",
      sourceName: "OpenChain heuristic",
      confidence: 0.45,
      basis: "Waktu dan nominal pendanaan sangat seragam. Keyakinan rendah karena belum ada bukti satu pengendali.",
      addedAt: "2026-09-12T09:00:00.000Z",
      evidenceTxHashes: [tx("flow:nbla-fund-bundler-4"), tx("flow:nbla-fund-bundler-5")],
    },
  ],
  evidence: flowEvidence(funderFlow, funderBaseFlow),
  links: [
    { kind: "flow", title: "Aliran dana di Ethereum", href: flowPath(funderFlow.chain, funderFlow.address) },
    { kind: "multichain", title: "Jelajah multichain", href: multichainPath(funderFlow.address) },
  ],
  snapshot: { ...funderFlow.snapshot, dataStatus: "complete" },
};

/* -------------------------------------------------------------------------- */
/* Pool likuiditas NBLA/WETH — Ethereum                                        */
/* -------------------------------------------------------------------------- */

const poolAddress = mockEvmAddress("nbla:univ2-pool");

const poolRisk: ObjectRisk = {
  kind: "contract",
  chain: "ethereum",
  address: poolAddress,
  title: "Uniswap V2: NBLA/WETH",
  score: 20,
  level: "low",
  reasons: [
    {
      id: "pool-single-provider",
      title: "Likuiditas hanya dari deployer",
      description: "Semua likuiditas awal ditambahkan deployer NBLA dalam satu transaksi. Bila LP token tidak dikunci, deployer bisa menarik likuiditas kapan saja.",
      severity: "medium",
      classification: "fact",
      points: 20,
      evidenceTxHashes: [tx("nbla:add-liquidity")],
    },
    {
      id: "pool-lock-claim",
      title: "Kunci LP token baru sebatas klaim",
      description: "Tim menyatakan LP token dikunci 12 bulan, tapi transaksi penguncian belum ditemukan. Tidak ikut dihitung ke skor sampai ada bukti.",
      severity: "medium",
      classification: "assumption",
      points: null,
      evidenceTxHashes: [],
    },
  ],
  warnings: [],
  traitChecks: [
    { trait: "upgradeable", status: "clear", note: "Kontrak pair Uniswap V2 standar, tidak bisa diganti." },
    { trait: "liquidity_unlocked", status: "unknown", note: "Belum ada transaksi penguncian LP token; klaim tim belum terbukti." },
    { trait: "liquidity_pulled", status: "clear", note: "Belum ada penarikan likuiditas sejak pool dibuat." },
  ],
  labels: [
    {
      type: "liquidity_pool",
      name: "Uniswap V2: NBLA/WETH",
      source: "external",
      sourceName: "DEX indexer",
      basis: "Kontrak pair yang dibuat factory Uniswap V2 untuk NBLA dan WETH.",
      addedAt: "2026-09-12T08:31:00.000Z",
      evidenceTxHashes: [tx("nbla:add-liquidity")],
    },
  ],
  evidence: flowEvidence(deployerFlow),
  links: [{ kind: "token", title: "Token NBLA", href: tokenPath(nblaToken.token.chain, nblaToken.token.address) }],
  snapshot: { fetchedAt: SNAPSHOT_AT, blockNumber: nblaToken.snapshot.blockNumber, sources: ["Node RPC (tiruan)", "DEX indexer (tiruan)"], dataStatus: "complete" },
};

/* -------------------------------------------------------------------------- */
/* Wallet baru tanpa aktivitas — Base                                          */
/* -------------------------------------------------------------------------- */

const emptyWalletRisk: ObjectRisk = {
  kind: "wallet",
  chain: emptyWalletFlow.chain,
  address: emptyWalletFlow.address,
  title: "Wallet tanpa aktivitas",
  score: null,
  level: "unknown",
  reasons: [],
  warnings: [],
  traitChecks: [
    { trait: "fresh_wallet_funding", status: "clear", note: "Tidak ada transfer keluar di rentang yang dipindai." },
    { trait: "exchange_cashout", status: "clear", note: "Tidak ada transfer keluar di rentang yang dipindai." },
    { trait: "bridge_hop", status: "clear", note: "Tidak ada transfer keluar di rentang yang dipindai." },
  ],
  labels: [],
  evidence: [],
  links: [{ kind: "flow", title: "Aliran dana di Base", href: flowPath(emptyWalletFlow.chain, emptyWalletFlow.address) }],
  snapshot: {
    ...emptyWalletFlow.snapshot,
    dataStatus: "complete",
    statusReason: "Belum ada transfer di rentang yang dipindai, jadi belum ada yang bisa dinilai.",
  },
};

export const MOCK_RISKS: ObjectRisk[] = [nblaRisk, funderRisk, poolRisk, emptyWalletRisk];

/** Objek yang sengaja membuat API tiruan gagal, untuk mencoba tampilan error. */
export const MOCK_FAILING_RISK = {
  chain: "arbitrum",
  address: mockEvmAddress("demo:risiko-gagal-dimuat"),
} as const;
