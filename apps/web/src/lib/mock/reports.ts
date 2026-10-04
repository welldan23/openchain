/**
 * Laporan investigasi tiruan selama fase frontend, disusun dari kasus tiruan
 * supaya klaim, bukti tersemat, dan catatan menunjuk data yang memang ada.
 * Satu laporan sengaja punya klaim yang belum lengkap untuk mencoba panel
 * kesiapan. Semua nilai FIKTIF.
 */
import { casePath } from "../api/cases";
import type { InvestigationCase, InvestigationReport, ReportBlock, ReportClaim } from "../types";
import { MOCK_CASES } from "./cases";

const [nblaCase, , bridgeCase] = MOCK_CASES;

function caseSource(item: InvestigationCase): InvestigationReport["source"] {
  return { caseId: item.id, title: item.title, href: casePath(item.id) };
}

function claimBlocks(item: InvestigationCase, provider: string): ReportBlock[] {
  return item.findings.map((finding) => {
    const claim: ReportClaim = {
      id: finding.id,
      title: finding.title,
      detail: finding.detail,
      classification: finding.classification,
      provider,
      observedAt: item.snapshot.fetchedAt,
      evidenceTxHashes: finding.evidenceTxHashes,
    };
    return { kind: "claim", id: `klaim-${finding.id}`, claim };
  });
}

function noteBlocks(item: InvestigationCase): ReportBlock[] {
  return item.notes.map((note) => ({ kind: "note", id: `catatan-${note.id}`, body: note.body, createdAt: note.createdAt }));
}

/* -------------------------------------------------------------------------- */
/* Draf: dugaan bundler NBLA                                                   */
/* -------------------------------------------------------------------------- */

// Bukti dipilih dari isinya, supaya keterangannya pasti sesuai transaksi.
const exchangeFunding = nblaCase.evidence.find((item) => item.movements.some((move) => move.fromLabel?.type === "exchange"))!;
const bundlerFunding = nblaCase.evidence.find((item) => item.movements.some((move) => move.toLabel?.type === "bot"))!;

const nblaReport: InvestigationReport = {
  id: "laporan-bundler-nbla",
  title: "Laporan dugaan bundler di peluncuran NBLA",
  summary: "Ringkasan temuan pendanaan bersama dan pembelian serempak di blok peluncuran NBLA, beserta bukti transaksinya.",
  status: "draft",
  createdAt: "2026-10-03T05:00:00.000Z",
  updatedAt: "2026-10-03T06:12:00.000Z",
  source: caseSource(nblaCase),
  sections: [
    {
      id: "ringkasan",
      title: "Ringkasan",
      blocks: [
        {
          kind: "paragraph",
          id: "ringkasan-1",
          text: "Lima wallet didanai satu address dalam rentang 9 menit, lalu membeli NBLA di blok yang sama dengan penambahan likuiditas. Polanya mirip bundler, tetapi belum ada bukti bahwa semuanya dikendalikan pihak yang sama.",
        },
      ],
    },
    {
      id: "temuan",
      title: "Temuan",
      blocks: [
        // Sengaja belum semua temuan kasus dimasukkan; sisanya bisa dipilih dari pemilih temuan.
        ...claimBlocks(nblaCase, "OpenChain heuristic").slice(0, 2),
        {
          kind: "claim",
          id: "klaim-pajak",
          claim: {
            id: "pajak",
            title: "Pajak jual dinaikkan setelah peluncuran",
            detail: "Owner menaikkan pajak jual dari 2% ke 5%. Waktu transaksinya belum dicantumkan di laporan ini.",
            classification: "fact",
            provider: "Node RPC (tiruan)",
            observedAt: null,
            evidenceTxHashes: [],
          },
        },
        {
          kind: "claim",
          id: "klaim-kunci-lp",
          claim: {
            id: "kunci-lp",
            title: "Tim menyatakan LP token dikunci 12 bulan",
            detail: "Pernyataan dari kanal resmi tim. Transaksi penguncian belum ditemukan di data on-chain.",
            classification: "assumption",
            provider: "Pernyataan tim (di luar rantai)",
            observedAt: "2026-10-02T12:00:00.000Z",
            evidenceTxHashes: [],
          },
        },
      ],
    },
    {
      id: "bukti",
      title: "Bukti utama",
      blocks: [
        { kind: "evidence", id: "bukti-1", chain: exchangeFunding.chain, txHash: exchangeFunding.txHash, caption: "Modal awal pendana dari hot wallet exchange." },
        { kind: "evidence", id: "bukti-2", chain: bundlerFunding.chain, txHash: bundlerFunding.txHash, caption: "Pendanaan dari pendana bersama ke salah satu wallet pembeli." },
      ],
    },
    { id: "catatan", title: "Catatan investigasi", blocks: noteBlocks(nblaCase) },
    { id: "batasan", title: "Batasan", blocks: [] },
  ],
  evidence: nblaCase.evidence,
  snapshot: nblaCase.snapshot,
};

/* -------------------------------------------------------------------------- */
/* Final: pendana NBLA memindahkan dana ke Base                                */
/* -------------------------------------------------------------------------- */

const bridgeReport: InvestigationReport = {
  id: "laporan-pendana-ke-base",
  title: "Perpindahan dana pendana NBLA ke Base",
  summary: "Kiriman lewat bridge dari Ethereum dicocokkan dengan penerimaan di Base, lalu dilacak pemakaiannya di Base.",
  status: "final",
  createdAt: "2026-10-02T15:50:00.000Z",
  updatedAt: "2026-10-02T16:30:00.000Z",
  source: caseSource(bridgeCase),
  sections: [
    {
      id: "ringkasan",
      title: "Ringkasan",
      blocks: [
        {
          kind: "paragraph",
          id: "ringkasan-1",
          text: "Pendana memindahkan sisa dananya ke Base lewat bridge. Jumlah yang diterima di Base sesuai dengan yang dikirim setelah dipotong biaya bridge.",
        },
      ],
    },
    { id: "temuan", title: "Temuan", blocks: claimBlocks(bridgeCase, "Node RPC (tiruan), Label publik explorer (tiruan)") },
    {
      id: "bukti",
      title: "Bukti utama",
      blocks: bridgeCase.findings[0].evidenceTxHashes.map((txHash, index) => ({
        kind: "evidence" as const,
        id: `bukti-${index + 1}`,
        chain: bridgeCase.evidence.find((item) => item.txHash === txHash)!.chain,
        txHash,
        caption: index === 0 ? "Kiriman ke kontrak bridge di Ethereum." : "Penerimaan di Base.",
      })),
    },
    {
      id: "batasan",
      title: "Batasan",
      blocks: [
        {
          kind: "paragraph",
          id: "batasan-1",
          text: "Pencocokan bridge berdasarkan jumlah dan waktu, bukan bukti dari kontrak bridge itu sendiri. Satu chain gagal dibaca saat snapshot diambil.",
        },
      ],
    },
  ],
  evidence: bridgeCase.evidence,
  snapshot: bridgeCase.snapshot,
};

export const MOCK_REPORTS: InvestigationReport[] = [nblaReport, bridgeReport];

/** Id laporan yang sengaja gagal dimuat, untuk mencoba tampilan error. */
export const MOCK_FAILING_REPORT_ID = "demo-gagal";
