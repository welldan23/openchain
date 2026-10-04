/**
 * Ekspor laporan ke HTML, JSON, CSV, dan Markdown (PDF lewat dialog cetak
 * dari versi HTML). Semua dibuat dari isi laporan saat ini, di browser.
 * Setiap klaim membawa provider, waktu data, dan hash buktinya; nilai yang
 * kosong ditulis "belum ada", tidak diisi tebakan. Laporan dengan masalah
 * kesiapan diberi tanda DRAF beserta daftar masalahnya.
 */
import { explorerTxUrl, getChain } from "./chains";
import { formatDateTime, formatNumber, formatTokenAmount } from "./format";
import { CASE_DATA_STATUS_META, CLASSIFICATION_META, REPORT_STATUS_META } from "./labels";
import { reportEvidenceEntries } from "./report-evidence";
import { reportIssues, type ReportIssue } from "./report";
import type { InvestigationReport, ReportBlock, TxEvidence } from "./types";

export type ReportExportFormat = "html" | "json" | "csv" | "markdown" | "pdf";

export const REPORT_EXPORT_FORMATS: Array<{ id: ReportExportFormat; label: string; description: string; extension: string; mime: string }> = [
  { id: "html", label: "HTML", description: "Halaman yang bisa dibuka di browser mana pun.", extension: "html", mime: "text/html;charset=utf-8" },
  { id: "markdown", label: "Markdown", description: "Teks rapi untuk catatan, wiki, atau repositori.", extension: "md", mime: "text/markdown;charset=utf-8" },
  { id: "json", label: "JSON", description: "Data lengkap untuk diolah ulang atau diarsipkan.", extension: "json", mime: "application/json;charset=utf-8" },
  { id: "csv", label: "CSV", description: "Tabel klaim dan bukti untuk spreadsheet.", extension: "csv", mime: "text/csv;charset=utf-8" },
  { id: "pdf", label: "PDF (opsional)", description: "Lewat dialog cetak browser, pilih \"Simpan sebagai PDF\".", extension: "pdf", mime: "application/pdf" },
];

const PRODUCT = "OpenChain Intelligence";
const MISSING = "belum ada";

function slug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "laporan"
  );
}

/** Nama file, mis. `laporan-dugaan-bundler-20261004.md`. Tanggal mengikuti waktu ekspor (UTC). */
export function exportFileName(report: Pick<InvestigationReport, "title">, format: Exclude<ReportExportFormat, "pdf">, generatedAt: Date): string {
  const meta = REPORT_EXPORT_FORMATS.find((item) => item.id === format)!;
  const base = slug(report.title);
  const name = base.startsWith("laporan") ? base : `laporan-${base}`;
  return `${name}-${generatedAt.toISOString().slice(0, 10).replace(/-/g, "")}.${meta.extension}`;
}

function blockers(issues: ReportIssue[]): ReportIssue[] {
  return issues.filter((issue) => issue.level === "blocker");
}

function movementText(evidence: TxEvidence): string[] {
  return evidence.movements.map((move) => `${formatTokenAmount(move.amount, move.asset.symbol)}: ${move.from} → ${move.to}`);
}

/* ---------------------------------- JSON ---------------------------------- */

export function reportToJson(report: InvestigationReport, generatedAt: Date): string {
  const issues = reportIssues(report);
  return JSON.stringify(
    {
      format: "openchain.report",
      version: 1,
      generatedAt: generatedAt.toISOString(),
      generator: PRODUCT,
      readiness: { ready: blockers(issues).length === 0, issues },
      report,
    },
    null,
    2,
  );
}

/* ----------------------------------- CSV ---------------------------------- */

/** Sel CSV aman: dikutip bila perlu, dan diawali `'` bila bisa dibaca sebagai rumus spreadsheet. */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADER = ["jenis_baris", "bagian", "judul", "jenis_informasi", "provider", "waktu_data", "chain", "tx_hash", "explorer", "keterangan"];

export function reportToCsv(report: InvestigationReport): string {
  const issues = reportIssues(report);
  const blockerCount = blockers(issues).length;
  // Baris pertama selalu status laporan, supaya file draf tidak terbaca sebagai laporan lengkap.
  const rows: Array<Array<string | number | null>> = [
    [
      "status_laporan",
      null,
      report.title,
      null,
      null,
      report.updatedAt,
      null,
      null,
      null,
      blockerCount > 0 ? `DRAF — belum lengkap: ${blockerCount} hal perlu dilengkapi` : `${REPORT_STATUS_META[report.status].label} — siap dibagikan`,
    ],
    ["snapshot", null, null, null, report.snapshot.sources.join(", ") || null, report.snapshot.fetchedAt, null, null, null, snapshotLines(report).join("; ")],
  ];
  const entries = new Map(reportEvidenceEntries(report).map((entry) => [entry.txHash.toLowerCase(), entry]));
  for (const section of report.sections) {
    for (const block of section.blocks) {
      if (block.kind === "claim") {
        const { claim } = block;
        const hashes = claim.evidenceTxHashes.length > 0 ? claim.evidenceTxHashes : [null];
        for (const hash of hashes) {
          const chain = hash ? (entries.get(hash.toLowerCase())?.chain ?? null) : null;
          rows.push([
            "klaim",
            section.title,
            claim.title,
            CLASSIFICATION_META[claim.classification].label,
            claim.provider,
            claim.observedAt,
            chain,
            hash,
            hash && chain ? explorerTxUrl(chain, hash) : null,
            claim.detail,
          ]);
        }
      } else if (block.kind === "evidence") {
        rows.push(["bukti", section.title, block.caption, "Fakta on-chain", null, null, block.chain, block.txHash, explorerTxUrl(block.chain, block.txHash), null]);
      } else if (block.kind === "entity") {
        rows.push(["entitas", section.title, block.subject.title, null, null, null, block.subject.chain ?? null, null, null, block.subject.address]);
      } else if (block.kind === "note") {
        rows.push(["catatan", section.title, null, null, null, block.createdAt, null, null, null, block.body]);
      }
    }
  }
  for (const issue of issues) {
    rows.push(["masalah_kesiapan", null, null, null, null, null, null, null, null, `${issue.level === "blocker" ? "Perlu dilengkapi" : "Peringatan"}: ${issue.message}`]);
  }
  // BOM supaya Excel membaca UTF-8 dengan benar.
  return `﻿${[CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/* -------------------------------- Markdown -------------------------------- */

/** Escape karakter Markdown di teks bebas supaya tidak berubah jadi format atau tautan. */
export function mdText(value: string): string {
  return value.replace(/([\\`*_[\]<>#|])/g, "\\$1").replace(/\r?\n/g, " ");
}

function mdBlock(block: ReportBlock, report: InvestigationReport): string[] {
  if (block.kind === "paragraph") return [mdText(block.text), ""];
  if (block.kind === "note") return [`> **Catatan investigasi** (${formatDateTime(block.createdAt)}): ${mdText(block.body)}`, ""];
  if (block.kind === "entity") {
    const { subject } = block;
    const where = subject.chain ? getChain(subject.chain).name : "semua chain EVM";
    return [`- **Entitas:** ${mdText(subject.title)} (${subject.kind === "token" ? "token" : "address"}, ${where}) \`${subject.address}\``, ""];
  }
  if (block.kind === "claim") {
    const { claim } = block;
    const entries = new Map(reportEvidenceEntries(report).map((entry) => [entry.txHash.toLowerCase(), entry]));
    const evidence = claim.evidenceTxHashes.map((hash) => {
      const chain = entries.get(hash.toLowerCase())?.chain;
      return chain ? `[\`${hash}\`](${explorerTxUrl(chain, hash)})` : `\`${hash}\``;
    });
    return [
      `### ${mdText(claim.title)}`,
      "",
      `*Jenis informasi: ${CLASSIFICATION_META[claim.classification].label}*`,
      "",
      mdText(claim.detail),
      "",
      `- Provider: ${claim.provider ? mdText(claim.provider) : `_${MISSING}_`}`,
      `- Waktu data: ${claim.observedAt ? formatDateTime(claim.observedAt) : `_${MISSING}_`}`,
      `- Bukti: ${evidence.length > 0 ? evidence.join(", ") : `_${MISSING}_`}`,
      "",
    ];
  }
  const stored = report.evidence.find((item) => item.txHash.toLowerCase() === block.txHash.toLowerCase());
  return [
    `**Bukti tersemat:** ${mdText(block.caption)}`,
    "",
    `- Hash: [\`${block.txHash}\`](${explorerTxUrl(block.chain, block.txHash)}) (${getChain(block.chain).name})`,
    ...(stored
      ? [`- Waktu: ${formatDateTime(stored.timestamp)}`, ...movementText(stored).map((line) => `- Perpindahan: ${mdText(line)}`)]
      : ["- Rincian transaksi tidak ikut tersimpan; buka di explorer."]),
    "",
  ];
}

function snapshotLines(report: InvestigationReport): string[] {
  const { snapshot } = report;
  return [
    `Diambil: ${formatDateTime(snapshot.fetchedAt)}`,
    `Blok: ${snapshot.blocks.length > 0 ? snapshot.blocks.map((block) => `${getChain(block.chain).name} ${formatNumber(block.blockNumber)}`).join(", ") : MISSING}`,
    `Sumber: ${snapshot.sources.length > 0 ? snapshot.sources.join(", ") : MISSING}`,
    `Kelengkapan: ${CASE_DATA_STATUS_META[snapshot.dataStatus].label}${snapshot.statusReason ? ` (${snapshot.statusReason})` : ""}`,
  ];
}

const FOOTER = "Data diambil read-only dari blockchain. Klaim heuristic adalah dugaan berbasis pola, bukan kepastian.";

export function reportToMarkdown(report: InvestigationReport, generatedAt: Date): string {
  const issues = reportIssues(report);
  const lines = [`# ${mdText(report.title)}`, ""];
  if (blockers(issues).length > 0) {
    lines.push(`> **DRAF — belum lengkap.** Masih ada ${blockers(issues).length} hal yang perlu dilengkapi (lihat bagian Masalah kesiapan).`, "");
  }
  lines.push(
    `Status: ${REPORT_STATUS_META[report.status].label} · Dibuat ${formatDateTime(report.createdAt)} · Diperbarui ${formatDateTime(report.updatedAt)}`,
    "",
  );
  if (report.source) lines.push(`Dari kasus: ${mdText(report.source.title)}`, "");
  lines.push(mdText(report.summary), "");
  report.sections.forEach((section, index) => {
    lines.push(`## ${index + 1}. ${mdText(section.title)}`, "");
    if (section.blocks.length === 0) lines.push("_Bagian ini masih kosong._", "");
    for (const block of section.blocks) lines.push(...mdBlock(block, report));
  });
  lines.push("## Snapshot data", "", ...snapshotLines(report).map((line) => `- ${line}`), "");
  if (issues.length > 0) {
    lines.push("## Masalah kesiapan", "", ...issues.map((issue) => `- ${issue.level === "blocker" ? "**Perlu dilengkapi:**" : "Peringatan:"} ${mdText(issue.message)}`), "");
  }
  lines.push("---", "", `Diekspor dari ${PRODUCT} pada ${formatDateTime(generatedAt.toISOString())}. ${FOOTER}`, "");
  return lines.join("\n");
}

/* ---------------------------------- HTML ---------------------------------- */

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function link(href: string, text: string): string {
  return `<a href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank">${escapeHtml(text)}</a>`;
}

function htmlBlock(block: ReportBlock, report: InvestigationReport): string {
  if (block.kind === "paragraph") return `<p>${escapeHtml(block.text)}</p>`;
  if (block.kind === "note") {
    return `<aside class="note"><strong>Catatan investigasi</strong> <span class="muted">${escapeHtml(formatDateTime(block.createdAt))}</span><p>${escapeHtml(block.body)}</p></aside>`;
  }
  if (block.kind === "entity") {
    const { subject } = block;
    const where = subject.chain ? getChain(subject.chain).name : "semua chain EVM";
    return `<p class="entity"><strong>${escapeHtml(subject.title)}</strong> <span class="muted">${subject.kind === "token" ? "token" : "address"}, ${escapeHtml(where)}</span><br><code>${escapeHtml(subject.address)}</code></p>`;
  }
  if (block.kind === "claim") {
    const { claim } = block;
    const entries = new Map(reportEvidenceEntries(report).map((entry) => [entry.txHash.toLowerCase(), entry]));
    const evidence = claim.evidenceTxHashes
      .map((hash) => {
        const chain = entries.get(hash.toLowerCase())?.chain;
        return chain ? link(explorerTxUrl(chain, hash), hash) : `<code>${escapeHtml(hash)}</code>`;
      })
      .join("<br>");
    const missing = `<em class="missing">${MISSING}</em>`;
    return `<div class="claim"><h3>${escapeHtml(claim.title)}</h3><p class="tag">${escapeHtml(CLASSIFICATION_META[claim.classification].label)}</p><p>${escapeHtml(claim.detail)}</p><dl><dt>Provider</dt><dd>${claim.provider ? escapeHtml(claim.provider) : missing}</dd><dt>Waktu data</dt><dd>${claim.observedAt ? escapeHtml(formatDateTime(claim.observedAt)) : missing}</dd><dt>Bukti</dt><dd>${evidence || missing}</dd></dl></div>`;
  }
  const stored = report.evidence.find((item) => item.txHash.toLowerCase() === block.txHash.toLowerCase());
  const details = stored
    ? `<p class="muted">${escapeHtml(formatDateTime(stored.timestamp))}</p><ul>${movementText(stored)
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("")}</ul>`
    : `<p class="muted">Rincian transaksi tidak ikut tersimpan; buka di explorer.</p>`;
  return `<figure class="evidence"><figcaption>${escapeHtml(block.caption)}</figcaption><p>${link(explorerTxUrl(block.chain, block.txHash), block.txHash)} <span class="muted">(${escapeHtml(getChain(block.chain).name)})</span></p>${details}</figure>`;
}

const HTML_STYLE = `body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#111827;line-height:1.55}
h1{font-size:1.6rem;margin-bottom:.25rem}h2{font-size:1.2rem;margin-top:2rem;border-bottom:1px solid #e5e7eb;padding-bottom:.25rem}h3{font-size:1rem;margin:0}
.muted{color:#6b7280;font-size:.85rem}.draft{border:1px solid #f59e0b;background:#fffbeb;padding:.5rem .75rem;border-radius:.5rem}
.claim,.evidence,.note,.entity{border:1px solid #e5e7eb;border-radius:.5rem;padding:.75rem;margin:.75rem 0}.tag{font-size:.75rem;color:#374151;margin:.25rem 0}
dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem .75rem;font-size:.85rem}dt{color:#6b7280}dd{margin:0;word-break:break-all}
code,a{word-break:break-all}.missing{color:#b91c1c}figure{margin:.75rem 0}figcaption{font-weight:600}
@media print{body{margin:0}a{color:inherit}}`;

export function reportToHtml(report: InvestigationReport, generatedAt: Date): string {
  const issues = reportIssues(report);
  const sections = report.sections
    .map(
      (section, index) =>
        `<section><h2>${index + 1}. ${escapeHtml(section.title)}</h2>${
          section.blocks.length === 0 ? `<p class="muted">Bagian ini masih kosong.</p>` : section.blocks.map((block) => htmlBlock(block, report)).join("\n")
        }</section>`,
    )
    .join("\n");
  const draft =
    blockers(issues).length > 0
      ? `<p class="draft"><strong>DRAF — belum lengkap.</strong> Masih ada ${blockers(issues).length} hal yang perlu dilengkapi (lihat Masalah kesiapan).</p>`
      : "";
  const issueList =
    issues.length > 0
      ? `<section><h2>Masalah kesiapan</h2><ul>${issues
          .map((issue) => `<li>${issue.level === "blocker" ? "<strong>Perlu dilengkapi:</strong> " : "Peringatan: "}${escapeHtml(issue.message)}</li>`)
          .join("")}</ul></section>`
      : "";
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${PRODUCT}">
<title>${escapeHtml(report.title)}</title>
<style>${HTML_STYLE}</style>
</head>
<body>
<h1>${escapeHtml(report.title)}</h1>
<p class="muted">Status: ${escapeHtml(REPORT_STATUS_META[report.status].label)} · Dibuat ${escapeHtml(formatDateTime(report.createdAt))} · Diperbarui ${escapeHtml(formatDateTime(report.updatedAt))}${
    report.source ? ` · Dari kasus: ${escapeHtml(report.source.title)}` : ""
  }</p>
${draft}
<p>${escapeHtml(report.summary)}</p>
${sections}
<section><h2>Snapshot data</h2><ul>${snapshotLines(report)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("")}</ul></section>
${issueList}
<hr>
<p class="muted">Diekspor dari ${PRODUCT} pada ${escapeHtml(formatDateTime(generatedAt.toISOString()))}. ${escapeHtml(FOOTER)}</p>
</body>
</html>
`;
}

/** Isi file untuk satu format; PDF dibuat dari HTML lewat dialog cetak. */
export function reportExportContent(report: InvestigationReport, format: Exclude<ReportExportFormat, "pdf">, generatedAt: Date): string {
  switch (format) {
    case "html":
      return reportToHtml(report, generatedAt);
    case "json":
      return reportToJson(report, generatedAt);
    case "csv":
      return reportToCsv(report);
    case "markdown":
      return reportToMarkdown(report, generatedAt);
  }
}
