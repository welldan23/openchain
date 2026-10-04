"use client";

import { ArrowDown, ExternalLink, FileSearch, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { EntityLabelBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { HashLink } from "@/components/ui/hash-link";
import { explorerAddressUrl, explorerTxUrl, getChain } from "@/lib/chains";
import { evidenceAnchor, evidenceLink, parseEvidenceAnchor } from "@/lib/evidence";
import { formatDateTime, formatTokenAmount, formatUsdCompact, shortenHash } from "@/lib/format";
import type { TxEvidence, TxMovement } from "@/lib/types";

interface EvidenceContextValue {
  open: (txHash: string) => void;
}

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

/** Hapus fragmen `#bukti-…` tanpa menambah riwayat browser. */
function clearAnchor() {
  if (parseEvidenceAnchor(window.location.hash)) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

/**
 * Menyediakan modal bukti untuk tombol `EvidenceTrigger` di dalamnya. Modal
 * juga terbuka sendiri bila URL berisi `#bukti-<hash>` yang dikenal.
 */
export function EvidenceProvider({ evidence, children }: { evidence: TxEvidence[]; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [activeHash, setActiveHash] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const byHash = useMemo(() => new Map(evidence.map((item) => [item.txHash.toLowerCase(), item])), [evidence]);
  const active = activeHash ? byHash.get(activeHash.toLowerCase()) : undefined;

  const open = useCallback(
    (txHash: string) => {
      if (!byHash.has(txHash.toLowerCase())) return;
      history.replaceState(null, "", `#${evidenceAnchor(txHash)}`);
      setShareUrl(evidenceLink(window.location.href, txHash));
      setActiveHash(txHash);
    },
    [byHash],
  );

  // Buka modal dari tautan bukti, saat halaman dimuat atau fragmen berubah.
  useEffect(() => {
    function fromLocation() {
      const txHash = parseEvidenceAnchor(window.location.hash);
      if (txHash) open(txHash);
    }
    fromLocation();
    window.addEventListener("hashchange", fromLocation);
    return () => window.removeEventListener("hashchange", fromLocation);
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (active && !dialog.open) dialog.showModal();
    if (!active && dialog.open) dialog.close();
  }, [active]);

  const contextValue = useMemo(() => ({ open }), [open]);

  return (
    <EvidenceContext.Provider value={contextValue}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="bukti-title"
        onClose={() => {
          setActiveHash(null);
          clearAnchor();
        }}
        onClick={(event) => {
          // Klik di latar gelap (di luar kotak modal) menutup modal.
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-0 text-foreground shadow-2xl shadow-black/60 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        {active ? <EvidenceBody evidence={active} shareUrl={shareUrl} onClose={() => dialogRef.current?.close()} /> : null}
      </dialog>
    </EvidenceContext.Provider>
  );
}

function Party({ role, chain, address, label }: { role: string; chain: TxEvidence["chain"]; address: string; label?: TxMovement["fromLabel"] }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted">{role}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <HashLink value={address} href={explorerAddressUrl(chain, address)} copyLabel={`Salin address ${role.toLowerCase()}`} />
        {label ? <EntityLabelBadge label={label} /> : null}
      </div>
    </div>
  );
}

/** Perpindahan aset di satu transaksi bukti: jumlah, pengirim, dan penerima. */
export function EvidenceMovements({ evidence }: { evidence: TxEvidence }) {
  return (
    <div>
      <p className="text-[11px] text-muted">
        {evidence.movements.length > 1 ? `${evidence.movements.length} perpindahan aset di transaksi ini` : "Perpindahan aset"}
      </p>
      <ul className="mt-1 space-y-2">
        {evidence.movements.map((movement, index) => (
          <li key={index} className="space-y-2 rounded-lg border border-line px-3 py-2.5">
            <p className="text-sm font-medium tabular-nums">
              {formatTokenAmount(movement.amount, movement.asset.symbol)}
              <span className="text-xs font-normal text-muted">
                {" "}
                · {movement.amountUsd !== undefined ? formatUsdCompact(movement.amountUsd) : "harga tidak diketahui"}
              </span>
            </p>
            <Party role="Pengirim" chain={evidence.chain} address={movement.from} label={movement.fromLabel} />
            <ArrowDown className="size-3.5 text-muted" aria-hidden />
            <Party role="Penerima" chain={evidence.chain} address={movement.to} label={movement.toLabel} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceBody({ evidence, shareUrl, onClose }: { evidence: TxEvidence; shareUrl: string; onClose: () => void }) {
  const chain = getChain(evidence.chain);
  return (
    <div>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-raised text-accent ring-1 ring-line">
            <FileSearch className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="bukti-title" className="text-sm font-semibold">
              Bukti transaksi
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {chain.name} · <time dateTime={evidence.timestamp}>{formatDateTime(evidence.timestamp)}</time>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup bukti"
          className="inline-grid size-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted">Hash transaksi</p>
            <ClassificationBadge classification="fact" />
          </div>
          <p className="mt-1 break-all rounded-lg bg-surface-raised px-3 py-2 font-mono text-xs leading-relaxed">
            {evidence.txHash}
          </p>
        </div>

        <EvidenceMovements evidence={evidence} />

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <CopyButton value={evidence.txHash} label="Salin hash" variant="labeled" />
          <CopyButton value={shareUrl} label="Salin tautan bukti" variant="labeled" />
          <a
            href={explorerTxUrl(evidence.chain, evidence.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            Buka di {chain.explorer.name}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
        <p className="text-[11px] text-muted">
          Tautan bukti membuka halaman ini dan langsung menampilkan transaksi yang sama.
        </p>
      </div>
    </div>
  );
}

/**
 * Hash transaksi yang dipendekkan; diklik untuk membuka modal bukti. Di luar
 * `EvidenceProvider`, tampil sebagai teks biasa.
 */
export function EvidenceTrigger({ txHash, head = 8, tail = 4 }: { txHash: string; head?: number; tail?: number }) {
  const context = useContext(EvidenceContext);
  if (!context) return <span className="font-mono text-xs">{shortenHash(txHash, head, tail)}</span>;
  return (
    <button
      type="button"
      onClick={() => context.open(txHash)}
      title={`Lihat bukti ${txHash}`}
      aria-haspopup="dialog"
      className="inline-flex items-center gap-1 rounded font-mono text-xs text-foreground/90 underline decoration-line decoration-dotted underline-offset-4 transition hover:text-accent hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <FileSearch className="size-3 shrink-0 text-muted" aria-hidden />
      {shortenHash(txHash, head, tail)}
      <span className="sr-only">, lihat bukti transaksi</span>
    </button>
  );
}
