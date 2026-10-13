/**
 * Ekspor laporan ke CSV dan PDF, murni dan sama isinya dengan ekspor di
 * frontend. Setiap klaim membawa provider, waktu data, dan hash buktinya
 * beserta tautan explorer; nilai kosong ditulis "belum ada", tidak diisi
 * tebakan. Laporan yang masih punya blocker diberi tanda DRAF beserta daftar
 * masalahnya. Waktu ditulis dalam UTC.
 */
import type { DataStatus, InfoClassification, ReportStatus } from '../database/schema/enums.js';
import { PdfDocument } from './pdf-writer.js';
import { blockersOf } from './report-readiness.js';
import type { ReportEvidenceEntry, ReportView } from './reports.types.js';

export type ReportExportFormat = 'csv' | 'pdf';
export const REPORT_EXPORT_FORMATS: Record<ReportExportFormat, { extension: string; mime: string }> = {
  csv: { extension: 'csv', mime: 'text/csv; charset=utf-8' },
  pdf: { extension: 'pdf', mime: 'application/pdf' },
};

const PRODUCT = 'OpenChain Intelligence';
const MISSING = 'belum ada';
const FOOTER = 'Data diambil read-only dari blockchain. Klaim heuristic adalah dugaan berbasis pola, bukan kepastian.';
export const STATUS_LABEL: Record<ReportStatus, string> = { draft: 'Draf', review: 'Ditinjau', final: 'Final' };
export const DATA_STATUS_LABEL: Record<DataStatus, string> = {
  complete: 'Data lengkap',
  partial: 'Data sebagian',
  stale: 'Data tertinggal',
  unavailable: 'Data tidak tersedia',
};

export interface ExportContext {
  /** Nama jenis informasi dari `info_classification_labels`. */
  classificationLabels: ReadonlyMap<InfoClassification, string>;
  /** Hash bukti laporan beserta tautan explorer dan rinciannya. */
  evidence: ReportEvidenceEntry[];
  generatedAt: Date;
}

function slug(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'laporan'
  );
}

/** Nama file, mis. `laporan-dugaan-bundler-20261004.pdf`; tanggal mengikuti waktu ekspor (UTC). */
export function exportFileName(title: string, format: ReportExportFormat, generatedAt: Date): string {
  const base = slug(title);
  const name = base.startsWith('laporan') ? base : `laporan-${base}`;
  return `${name}-${generatedAt.toISOString().slice(0, 10).replace(/-/g, '')}.${REPORT_EXPORT_FORMATS[format].extension}`;
}

/** Waktu dalam UTC, mis. `2026-10-03 04:30 UTC`. */
export function formatUtc(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

const label = (context: ExportContext, classification: InfoClassification) => context.classificationLabels.get(classification) ?? classification;
const entryOf = (context: ExportContext, chain: string, txHash: string) => context.evidence.find((item) => item.chain === chain && item.txHash === txHash);

function readinessLine(report: ReportView): string {
  const blockers = blockersOf(report.readiness.issues).length;
  return blockers > 0 ? `DRAF — belum lengkap: ${blockers} hal perlu dilengkapi` : `${STATUS_LABEL[report.status]} — siap dibagikan`;
}

function snapshotLines(report: ReportView): string[] {
  const { snapshot } = report;
  return [
    `Diambil: ${formatUtc(snapshot.fetchedAt)}`,
    `Blok: ${snapshot.blocks.length > 0 ? snapshot.blocks.map((block) => `${block.chain} ${block.blockNumber.toLocaleString('id-ID')}`).join(', ') : MISSING}`,
    `Sumber: ${snapshot.sources.length > 0 ? snapshot.sources.join(', ') : MISSING}`,
    `Kelengkapan: ${DATA_STATUS_LABEL[snapshot.dataStatus]}${snapshot.statusReason ? ` (${snapshot.statusReason})` : ''}`,
  ];
}

/* ----------------------------------- CSV ---------------------------------- */

/** Sel CSV aman: dikutip bila perlu, dan diawali `'` bila bisa dibaca sebagai rumus spreadsheet. */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADER = ['jenis_baris', 'bagian', 'judul', 'jenis_informasi', 'provider', 'waktu_data', 'chain', 'tx_hash', 'explorer', 'keterangan'];

export function reportToCsv(report: ReportView, context: ExportContext): string {
  // Baris pertama selalu status laporan, supaya file draf tidak terbaca sebagai laporan lengkap.
  const rows: Array<Array<string | number | null>> = [
    ['status_laporan', null, report.title, null, null, report.updatedAt, null, null, null, readinessLine(report)],
    ['snapshot', null, null, null, report.snapshot.sources.join(', ') || null, report.snapshot.fetchedAt, null, null, null, snapshotLines(report).join('; ')],
  ];
  for (const section of report.sections) {
    for (const block of section.blocks) {
      if (block.kind === 'claim') {
        const { claim } = block;
        const refs = claim.evidence.length > 0 ? claim.evidence : [null];
        for (const ref of refs) {
          rows.push([
            'klaim',
            section.title,
            claim.title,
            label(context, claim.classification),
            claim.provider,
            claim.observedAt,
            ref?.chain ?? null,
            ref?.txHash ?? null,
            ref ? (entryOf(context, ref.chain, ref.txHash)?.explorerUrl ?? null) : null,
            claim.detail,
          ]);
        }
      } else if (block.kind === 'evidence') {
        rows.push(['bukti', section.title, block.caption, label(context, 'verified_fact'), null, null, block.chain, block.txHash, entryOf(context, block.chain, block.txHash)?.explorerUrl ?? null, null]);
      } else if (block.kind === 'entity') {
        rows.push(['entitas', section.title, block.subject.title, null, null, null, block.subject.chain, null, null, block.subject.address]);
      } else if (block.kind === 'note') {
        rows.push(['catatan', section.title, null, null, null, block.createdAt, null, null, null, block.body]);
      }
    }
  }
  for (const issue of report.readiness.issues) {
    rows.push(['masalah_kesiapan', null, null, null, null, null, null, null, null, `${issue.level === 'blocker' ? 'Perlu dilengkapi' : 'Peringatan'}: ${issue.message}`]);
  }
  // BOM supaya Excel membaca UTF-8 dengan benar.
  return `﻿${[CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/* ----------------------------------- PDF ---------------------------------- */

export function reportToPdf(report: ReportView, context: ExportContext): Buffer {
  const pdf = new PdfDocument(`${PRODUCT}. ${FOOTER}`);
  const blockers = blockersOf(report.readiness.issues).length;
  pdf.text(report.title, { size: 18, bold: true, after: 4 });
  pdf.text(readinessLine(report), { size: 10, bold: blockers > 0, gray: blockers > 0 ? 0 : 0.3, after: 2 });
  const meta = [
    `Status: ${STATUS_LABEL[report.status]}${report.finalizedAt ? ` (difinalkan ${formatUtc(report.finalizedAt)})` : ''}`,
    `Kasus sumber: ${report.source ? report.source.title : MISSING}`,
    `Dibuat ${formatUtc(report.createdAt)} · diperbarui ${formatUtc(report.updatedAt)} · diekspor ${formatUtc(context.generatedAt)}`,
  ];
  for (const line of meta) pdf.text(line, { size: 9, gray: 0.3 });
  if (report.summary) {
    pdf.space(6);
    pdf.text(report.summary, { size: 10 });
  }
  pdf.space(6);
  pdf.keep(80);
  pdf.text('Snapshot data', { size: 11, bold: true, after: 2 });
  for (const line of snapshotLines(report)) pdf.text(line, { size: 9 });

  for (const section of report.sections) {
    pdf.keep(70);
    pdf.rule();
    pdf.text(section.title, { size: 13, bold: true, after: 4 });
    if (section.blocks.length === 0) pdf.text('Bagian ini masih kosong.', { size: 9, gray: 0.45, after: 4 });
    for (const block of section.blocks) {
      if (block.kind === 'paragraph') {
        pdf.text(block.text, { size: 10, after: 6 });
      } else if (block.kind === 'note') {
        pdf.text(`Catatan investigasi (${formatUtc(block.createdAt)}${block.editedAt ? `, diubah ${formatUtc(block.editedAt)}` : ''}): ${block.body}`, {
          size: 9,
          gray: 0.25,
          indent: 10,
          after: 6,
        });
      } else if (block.kind === 'entity') {
        const { subject } = block;
        pdf.text(`Entitas: ${subject.title} (${subject.kind === 'token' ? 'token' : 'address'}, ${subject.chain ?? 'semua chain EVM'})`, { size: 10, bold: true });
        pdf.text(subject.address, { size: 9, indent: 10, after: 6 });
      } else if (block.kind === 'claim') {
        const { claim } = block;
        pdf.keep(75);
        pdf.text(claim.title, { size: 11, bold: true, after: 1 });
        pdf.text(`Jenis informasi: ${label(context, claim.classification)}`, { size: 9, gray: 0.3 });
        if (claim.detail) pdf.text(claim.detail, { size: 10 });
        pdf.text(`Provider: ${claim.provider ?? MISSING}`, { size: 9, indent: 10 });
        pdf.text(`Waktu data: ${claim.observedAt ? formatUtc(claim.observedAt) : MISSING}`, { size: 9, indent: 10 });
        if (claim.evidence.length === 0) pdf.text(`Bukti: ${MISSING}`, { size: 9, indent: 10 });
        for (const ref of claim.evidence) {
          const url = entryOf(context, ref.chain, ref.txHash)?.explorerUrl ?? null;
          pdf.text(`Bukti (${ref.chain}): ${ref.txHash}`, { size: 9, indent: 10, link: url, gray: url ? 0 : 0.3 });
        }
        pdf.space(6);
      } else {
        const entry = entryOf(context, block.chain, block.txHash);
        pdf.keep(55);
        pdf.text(`Bukti tersemat: ${block.caption || 'Bukti transaksi.'}`, { size: 10, bold: true });
        pdf.text(`Hash (${block.chain}): ${block.txHash}`, { size: 9, indent: 10, link: entry?.explorerUrl ?? null });
        if (entry?.detail) {
          pdf.text(`Waktu: ${formatUtc(entry.detail.timestamp)} · blok ${entry.detail.blockNumber.toLocaleString('id-ID')}`, { size: 9, indent: 10 });
          for (const move of entry.detail.movements) {
            const amount = move.amount === null ? `${move.amountRaw} (satuan mentah)` : move.amount;
            pdf.text(`Perpindahan: ${amount} ${move.asset.symbol ?? ''}: ${move.from} -> ${move.to}`, { size: 9, indent: 10 });
          }
        } else {
          pdf.text('Rincian transaksi tidak ikut tersimpan; buka di explorer.', { size: 9, indent: 10, gray: 0.45 });
        }
        pdf.space(6);
      }
    }
  }

  if (report.readiness.issues.length > 0) {
    pdf.keep(70);
    pdf.rule();
    pdf.text('Masalah kesiapan', { size: 13, bold: true, after: 4 });
    for (const issue of report.readiness.issues) {
      pdf.text(`${issue.level === 'blocker' ? 'Perlu dilengkapi' : 'Peringatan'}: ${issue.message}`, { size: 9, indent: 10 });
    }
  }
  return pdf.toBuffer({ title: report.title, createdAt: context.generatedAt });
}
