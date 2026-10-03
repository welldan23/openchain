"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Table2 } from "lucide-react";
import { useState } from "react";
import { ChainBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { Panel } from "@/components/ui/panel";
import { SERIES_1 } from "@/lib/chart-colors";
import { cn } from "@/lib/cn";
import { EMPTY_VALUE, formatDate, formatNumber, formatPct, formatUsdCompact } from "@/lib/format";
import { columnLeaders, sortComparison, type ComparisonKey, type ComparisonRow } from "@/lib/multichain";

const COLUMNS: Array<{ key: ComparisonKey; label: string; numeric: boolean }> = [
  { key: "chain", label: "Jaringan", numeric: false },
  { key: "txCount", label: "Transaksi", numeric: true },
  { key: "inUsd", label: "Masuk", numeric: true },
  { key: "outUsd", label: "Keluar", numeric: true },
  { key: "netUsd", label: "Selisih", numeric: true },
  { key: "counterpartyCount", label: "Lawan", numeric: true },
  { key: "balanceUsd", label: "Saldo", numeric: true },
  { key: "lastSeen", label: "Terakhir aktif", numeric: false },
];

function signedUsd(value: number): string {
  return `${value > 0 ? "+" : ""}${formatUsdCompact(value)}`;
}

/**
 * Perbandingan aktivitas antar chain. Klik judul kolom untuk mengurutkan;
 * nilai tertinggi tiap kolom ditebalkan. Chain tidak aktif selalu di bawah.
 */
export function ChainComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  const [sortKey, setSortKey] = useState<ComparisonKey>("txCount");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const sorted = sortComparison(rows, sortKey, direction);
  const leaders = columnLeaders(rows);

  function sortBy(key: ComparisonKey) {
    if (key === sortKey) setDirection((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDirection(key === "chain" ? "asc" : "desc");
    }
  }

  function cell(row: ComparisonRow, key: ComparisonKey, text: string) {
    const leader = leaders[key] === row.chain;
    return (
      <span className={cn("tabular-nums", leader ? "font-semibold text-foreground" : "text-foreground/85")}>
        {text}
        {leader ? <span className="sr-only"> (tertinggi)</span> : null}
      </span>
    );
  }

  return (
    <Panel
      id="perbandingan-chain"
      title="Perbandingan antar chain"
      description="Klik judul kolom untuk mengurutkan. Nilai tebal adalah yang tertinggi di kolomnya."
      icon={Table2}
      action={<ClassificationBadge classification="calculation" />}
    >
      {/* `relative` supaya teks khusus pembaca layar (absolute) ikut terpotong di dalam area geser. */}
      <div className="relative -mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[680px] text-left text-xs">
          <caption className="sr-only">Perbandingan aktivitas address ini di tiap jaringan</caption>
          <thead className="text-muted">
            <tr className="border-b border-line">
              {COLUMNS.map((column, index) => {
                const active = sortKey === column.key;
                const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(
                      "py-2 font-medium whitespace-nowrap",
                      index === 0 ? "pl-4 pr-2 sm:pl-5" : "px-2",
                      index === COLUMNS.length - 1 && "pr-4 sm:pr-5",
                      column.numeric && "text-right",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(column.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent",
                        active && "text-foreground",
                      )}
                    >
                      {column.label}
                      <Icon className={cn("size-3", !active && "opacity-50")} aria-hidden />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((row) => (
              <tr key={row.chain} className={cn(!row.active && "text-muted")}>
                <th scope="row" className="py-2.5 pl-4 pr-2 font-normal sm:pl-5">
                  <span className="flex items-center gap-2">
                    <ChainBadge chain={row.chain} />
                    {!row.active ? <span className="text-[11px] text-muted">tidak aktif</span> : null}
                  </span>
                  {row.bridgesOut + row.bridgesIn > 0 ? (
                    <span className="mt-1 block text-[11px] text-muted">
                      bridge {row.bridgesOut} keluar · {row.bridgesIn} masuk
                    </span>
                  ) : null}
                </th>
                <td className="px-2 py-2.5 text-right">
                  {row.active ? (
                    <span className="inline-flex items-center justify-end gap-2">
                      <span aria-hidden className="hidden h-1.5 w-14 sm:block">
                        <span
                          className="block h-full rounded-r-[4px]"
                          style={{ width: `${row.txSharePct}%`, backgroundColor: SERIES_1 }}
                        />
                      </span>
                      {cell(row, "txCount", formatNumber(row.txCount))}
                      <span className="w-12 text-[11px] text-muted">{formatPct(row.txSharePct, { maximumFractionDigits: 1 })}</span>
                    </span>
                  ) : (
                    EMPTY_VALUE
                  )}
                </td>
                <td className="px-2 py-2.5 text-right">{row.active ? cell(row, "inUsd", formatUsdCompact(row.inUsd)) : EMPTY_VALUE}</td>
                <td className="px-2 py-2.5 text-right">{row.active ? cell(row, "outUsd", formatUsdCompact(row.outUsd)) : EMPTY_VALUE}</td>
                <td className="px-2 py-2.5 text-right">{row.active ? cell(row, "netUsd", signedUsd(row.netUsd)) : EMPTY_VALUE}</td>
                <td className="px-2 py-2.5 text-right">
                  {row.active ? cell(row, "counterpartyCount", formatNumber(row.counterpartyCount)) : EMPTY_VALUE}
                </td>
                <td className="px-2 py-2.5 text-right">
                  {row.active || row.balanceUsd > 0 ? cell(row, "balanceUsd", formatUsdCompact(row.balanceUsd)) : EMPTY_VALUE}
                </td>
                <td className="py-2.5 pl-2 pr-4 whitespace-nowrap sm:pr-5">
                  {row.lastSeen ? formatDate(row.lastSeen) : EMPTY_VALUE}
                  {row.firstSeen ? <span className="block text-[11px] text-muted">sejak {formatDate(row.firstSeen)}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
