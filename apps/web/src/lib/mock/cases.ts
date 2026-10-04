/**
 * Kasus investigasi tiruan selama fase frontend. Dibangun dari data tiruan
 * halaman lain (peta, aliran dana, multichain), jadi setiap subjek, langkah,
 * dan hash bukti membuka sesuatu yang memang ada. Semua nilai FIKTIF.
 */
import { flowPath } from "../api/flows";
import { multichainPath } from "../api/multichain";
import { tokenPath } from "../api/tokens";
import { evidenceFromCoordination, evidenceFromCrossChain, evidenceFromEdges, evidenceFromTransfers, mergeEvidence } from "../evidence";
import { canSaveFinding, findingsFromClusters } from "../cases";
import { addressTitle } from "../fund-flow";
import type { CaseFinding, InvestigationCase, TxEvidence, WalletMap } from "../types";
import { MOCK_FLOWS } from "./flows";
import { MOCK_MAPS } from "./maps";
import { MOCK_MULTICHAIN } from "./multichain";
import { MOCK_HISTORY } from "./search";

const [funderFlow, , kodoCreatorFlow, , funderBaseFlow] = MOCK_FLOWS;
const [nblaMap, kodoMap] = MOCK_MAPS;
const [funderProfile] = MOCK_MULTICHAIN;

function mapEvidence(map: WalletMap): TxEvidence[] {
  return mergeEvidence(evidenceFromEdges(map.chain, map.edges, map.nodes), evidenceFromCoordination(map.chain, map.coordination, map.nodes));
}

/** Sinyal kelompok pertama yang terpenuhi dan punya bukti, sebagai temuan kasus. */
function clusterFindings(map: WalletMap, clusterIndex: number): CaseFinding[] {
  return findingsFromClusters([map.clusters[clusterIndex]]).filter(canSaveFinding);
}

function steps(...ids: string[]) {
  return MOCK_HISTORY.filter((entry) => ids.includes(entry.id));
}

const nblaCase: InvestigationCase = {
  id: "bundler-nbla",
  title: `Dugaan bundler di peluncuran ${nblaMap.token.symbol}`,
  summary: `Lima wallet yang didanai pendana yang sama membeli ${nblaMap.token.symbol} di blok yang sama dengan penambahan likuiditas, lalu sebagian mengirim dana kembali ke pendana.`,
  status: "open",
  createdAt: "2026-10-02T09:10:00.000Z",
  updatedAt: "2026-10-03T04:20:00.000Z",
  tags: ["bundler", "peluncuran token"],
  subjects: [
    {
      kind: "token",
      chain: nblaMap.chain,
      address: nblaMap.token.address,
      title: `${nblaMap.token.name} (${nblaMap.token.symbol})`,
      href: tokenPath(nblaMap.chain, nblaMap.token.address),
    },
    {
      kind: "address",
      chain: funderFlow.chain,
      address: funderFlow.address,
      title: addressTitle(funderFlow.label),
      label: funderFlow.label,
      href: flowPath(funderFlow.chain, funderFlow.address),
    },
  ],
  findings: clusterFindings(nblaMap, 0),
  evidence: mergeEvidence(mapEvidence(nblaMap), evidenceFromTransfers(funderFlow.chain, funderFlow, funderFlow.transfers)),
  steps: steps("hist-1", "hist-2", "hist-4", "hist-5"),
  notes: [
    {
      id: "nbla-note-1",
      body: "Pendana menerima modal dari hot wallet exchange. Belum bisa disimpulkan siapa pemiliknya tanpa data exchange.",
      createdAt: "2026-10-02T09:40:00.000Z",
    },
    {
      id: "nbla-note-2",
      body: "Cek lagi apakah 5 bundler masih memegang token setelah 7 hari.",
      createdAt: "2026-10-03T04:18:00.000Z",
    },
  ],
  snapshot: {
    fetchedAt: nblaMap.snapshot.fetchedAt,
    blocks: [{ chain: nblaMap.chain, blockNumber: nblaMap.snapshot.blockNumber }],
    sources: nblaMap.snapshot.sources,
    dataStatus: "complete",
  },
};

const kodoCase: InvestigationCase = {
  id: "pembuat-kodo",
  title: `Pembuat ${kodoMap.token.symbol} dan wallet yang didanainya`,
  summary: `Pembuat token ${kodoMap.token.symbol} mendanai beberapa wallet sesaat sebelum peluncuran. Dipantau untuk melihat apakah wallet itu menjual bersamaan.`,
  status: "monitoring",
  createdAt: "2026-09-29T07:20:00.000Z",
  updatedAt: "2026-10-01T10:05:00.000Z",
  tags: ["solana", "pembuat token"],
  subjects: [
    {
      kind: "token",
      chain: kodoMap.chain,
      address: kodoMap.token.address,
      title: `${kodoMap.token.name} (${kodoMap.token.symbol})`,
      href: tokenPath(kodoMap.chain, kodoMap.token.address),
    },
    {
      kind: "address",
      chain: kodoCreatorFlow.chain,
      address: kodoCreatorFlow.address,
      title: addressTitle(kodoCreatorFlow.label),
      label: kodoCreatorFlow.label,
      href: flowPath(kodoCreatorFlow.chain, kodoCreatorFlow.address),
    },
  ],
  findings: clusterFindings(kodoMap, 0),
  evidence: mergeEvidence(mapEvidence(kodoMap), evidenceFromTransfers(kodoCreatorFlow.chain, kodoCreatorFlow, kodoCreatorFlow.transfers)),
  steps: steps("hist-6"),
  notes: [
    {
      id: "kodo-note-1",
      body: "Belum ada penjualan serempak. Buka lagi bila ada transfer keluar besar dari wallet yang didanai.",
      createdAt: "2026-10-01T10:05:00.000Z",
    },
  ],
  snapshot: {
    fetchedAt: kodoMap.snapshot.fetchedAt,
    blocks: [{ chain: kodoMap.chain, blockNumber: kodoMap.snapshot.blockNumber }],
    sources: kodoMap.snapshot.sources,
    dataStatus: "stale",
    statusReason: "Snapshot terakhir diambil saat kasus mulai dipantau. Aktivitas setelahnya belum masuk sampai kasus dibuka ulang.",
  },
};

const [bridge] = funderProfile.bridges;
const unavailable = funderProfile.chains.find((chain) => chain.status === "unavailable");

const bridgeCase: InvestigationCase = {
  id: "pendana-ke-base",
  title: "Pendana NBLA memindahkan dana ke Base",
  summary: "Sisa dana pendana dipindahkan lewat bridge ke Base dan dipakai di sana. Kiriman dan penerimaannya sudah dicocokkan.",
  status: "closed",
  createdAt: "2026-10-02T15:00:00.000Z",
  updatedAt: "2026-10-02T15:45:00.000Z",
  tags: ["bridge", "multichain"],
  subjects: [
    {
      kind: "address",
      address: funderProfile.address,
      title: `${addressTitle(funderProfile.label)} di semua chain`,
      label: funderProfile.label,
      href: multichainPath(funderProfile.address),
    },
    {
      kind: "address",
      chain: funderBaseFlow.chain,
      address: funderBaseFlow.address,
      title: `${addressTitle(funderBaseFlow.label)} di Base`,
      label: funderBaseFlow.label,
      href: flowPath(funderBaseFlow.chain, funderBaseFlow.address),
    },
  ],
  findings: [
    {
      id: "bridge-match",
      title: "Kiriman bridge cocok dengan penerimaan di Base",
      detail: "Jumlah yang diterima di Base hanya sedikit lebih kecil dari yang dikirim (biaya bridge) dan tiba 11 menit kemudian.",
      classification: "calculation",
      evidenceTxHashes: [bridge.sentTxHash, ...(bridge.receivedTxHash ? [bridge.receivedTxHash] : [])],
    },
  ],
  evidence: evidenceFromCrossChain(funderProfile, funderProfile.activities),
  steps: steps("hist-3"),
  notes: [],
  snapshot: {
    fetchedAt: funderProfile.fetchedAt,
    blocks: funderProfile.chains
      .filter((chain) => chain.status !== "unavailable" && chain.txCount > 0)
      .map((chain) => ({ chain: chain.chain, blockNumber: chain.snapshotBlock })),
    sources: funderProfile.sources,
    dataStatus: "partial",
    statusReason: unavailable?.statusReason,
  },
};

export const MOCK_CASES: InvestigationCase[] = [nblaCase, kodoCase, bridgeCase];

/** Id kasus yang sengaja gagal dimuat, untuk mencoba tampilan error. */
export const MOCK_FAILING_CASE_ID = "demo-gagal";
