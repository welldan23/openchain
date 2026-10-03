"use client";

import { ArrowDownLeft, ArrowUpRight, MousePointerClick, Network, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { EntityLabelBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { formatDateTime, formatPct, formatTokenAmount, formatUsdCompact, shortenHash } from "@/lib/format";
import { addressKey, addressTitle } from "@/lib/fund-flow";
import type { ChainId, MapEdge, MapNode } from "@/lib/types";
import { CHART_SURFACE } from "@/lib/chart-colors";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/wallet-map";

export interface ExplorerNode {
  node: MapNode;
  x: number;
  y: number;
  r: number;
  color: string;
  clusterName?: string;
}

interface WalletMapExplorerProps {
  chain: ChainId;
  symbol: string;
  nodes: ExplorerNode[];
  edges: MapEdge[];
}

const EDGE_COLOR = "#3a4a63";
const EDGE_ACTIVE_COLOR = "#8b9bb2";
/** Gelembung sebesar ini atau lebih diberi label langsung di dalamnya. */
const LABEL_MIN_RADIUS = 22;

function nodeName(node: MapNode): string {
  return node.label ? addressTitle(node.label) : shortenHash(node.address, 4, 4);
}

/** Ujung garis berhenti di tepi gelembung tujuan supaya panahnya terlihat. */
function edgeEnds(from: ExplorerNode, to: ExplorerNode) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.max(Math.hypot(dx, dy), 0.01);
  const ux = dx / dist;
  const uy = dy / dist;
  return {
    x1: from.x + ux * (from.r + 2),
    y1: from.y + uy * (from.r + 2),
    x2: to.x - ux * (to.r + 5),
    y2: to.y - uy * (to.r + 5),
  };
}

export function WalletMapExplorer({ chain, symbol, nodes, edges }: WalletMapExplorerProps) {
  const markerId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(nodes.map((item) => [addressKey(chain, item.node.address), item])), [chain, nodes]);
  const focusKey = hovered ?? selected;

  const neighbors = useMemo(() => {
    if (!focusKey) return null;
    const result = new Set([focusKey]);
    for (const edge of edges) {
      const from = addressKey(chain, edge.from);
      const to = addressKey(chain, edge.to);
      if (from === focusKey) result.add(to);
      if (to === focusKey) result.add(from);
    }
    return result;
  }, [chain, edges, focusKey]);

  useEffect(() => {
    if (!selected) return;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  const hoveredItem = hovered ? byKey.get(hovered) : undefined;
  const selectedItem = selected ? byKey.get(selected) : undefined;

  function select(key: string) {
    const next = selected === key ? null : key;
    setSelected(next);
    // Di layar sempit panel detail ada di bawah peta; bawa ke sana supaya terlihat.
    if (next && window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() =>
        document.getElementById("detail-wallet")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }

  function onNodeKey(event: KeyboardEvent<SVGGElement>, key: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(key);
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
      <Panel
        id="peta"
        title="Peta hubungan"
        description="Gelembung = wallet, besarnya sebanding porsi supply. Garis = transfer di antara wallet."
        icon={Network}
        className="min-w-0 lg:col-span-2"
        action={<ClassificationBadge classification="heuristic" />}
      >
        {/* Di layar sempit peta tetap selebar 560px dan bisa digeser, supaya gelembung kecil masih bisa di-tap. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div ref={containerRef} className="relative min-w-[560px]">
            <svg
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              className="block h-auto w-full touch-manipulation select-none"
              role="group"
              aria-label={`Peta hubungan ${nodes.length} wallet holder ${symbol}`}
              onPointerLeave={() => setHovered(null)}
            >
              <defs>
                <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill={EDGE_ACTIVE_COLOR} />
                </marker>
              </defs>
              <g aria-hidden>
                {edges.map((edge) => {
                  const from = byKey.get(addressKey(chain, edge.from));
                  const to = byKey.get(addressKey(chain, edge.to));
                  if (!from || !to) return null;
                  const touches =
                    focusKey !== null &&
                    (addressKey(chain, edge.from) === focusKey || addressKey(chain, edge.to) === focusKey);
                  return (
                    <line
                      key={edge.id}
                      {...edgeEnds(from, to)}
                      stroke={touches ? EDGE_ACTIVE_COLOR : EDGE_COLOR}
                      strokeWidth={touches ? 2 : 1.5}
                      strokeDasharray={edge.kind === "funding" ? "5 4" : undefined}
                      strokeLinecap="round"
                      markerEnd={touches ? `url(#${markerId})` : undefined}
                      opacity={focusKey && !touches ? 0.25 : 1}
                    />
                  );
                })}
              </g>
              {nodes.map((item) => {
                const key = addressKey(chain, item.node.address);
                const dimmed = neighbors !== null && !neighbors.has(key);
                const isSelected = selected === key;
                const holder = item.node.sharePct > 0;
                const showLabel = item.r >= LABEL_MIN_RADIUS;
                return (
                  <g
                    key={key}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`${nodeName(item.node)}, ${holder ? `${formatPct(item.node.sharePct)} supply` : "bukan holder"}${item.clusterName ? `, klaster ${item.clusterName}` : ""}`}
                    className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-accent"
                    opacity={dimmed ? 0.3 : 1}
                    onPointerEnter={(event) => {
                      if (event.pointerType === "mouse") setHovered(key);
                    }}
                    onFocus={() => setHovered(key)}
                    onBlur={() => setHovered(null)}
                    onClick={() => select(key)}
                    onKeyDown={(event) => onNodeKey(event, key)}
                  >
                    {/* Area sentuh minimal 12px supaya gelembung kecil mudah di-tap. */}
                    <circle cx={item.x} cy={item.y} r={Math.max(item.r, 12)} fill="transparent" stroke="transparent" strokeWidth={3} />
                    <circle
                      cx={item.x}
                      cy={item.y}
                      r={item.r}
                      fill={holder ? item.color : CHART_SURFACE}
                      fillOpacity={holder ? 0.9 : 1}
                      stroke={holder ? CHART_SURFACE : item.color}
                      strokeWidth={2}
                    />
                    {isSelected ? (
                      <circle cx={item.x} cy={item.y} r={item.r + 4} fill="none" stroke="var(--foreground)" strokeWidth={1.5} />
                    ) : null}
                    {showLabel ? (
                      <text
                        x={item.x}
                        y={item.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        stroke={CHART_SURFACE}
                        strokeWidth={3}
                        strokeOpacity={0.6}
                        style={{ paintOrder: "stroke" }}
                        className="pointer-events-none fill-foreground text-[11px] font-medium"
                      >
                        {formatPct(item.node.sharePct, { maximumFractionDigits: 1 })}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
  
            {hoveredItem ? (
              <div
                role="tooltip"
                style={{
                  left: `${(hoveredItem.x / MAP_WIDTH) * 100}%`,
                  top: `${((hoveredItem.y - hoveredItem.r) / MAP_HEIGHT) * 100}%`,
                }}
                className="pointer-events-none absolute z-30 w-52 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-lg border border-line bg-surface-raised px-3 py-2 shadow-xl shadow-black/40"
              >
                <p className="text-sm font-semibold">
                  {hoveredItem.node.sharePct > 0 ? formatPct(hoveredItem.node.sharePct) : "Bukan holder"}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-foreground/80">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: hoveredItem.color }} />
                  <span className="truncate">{nodeName(hoveredItem.node)}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {shortenHash(hoveredItem.node.address)}
                  {hoveredItem.clusterName ? ` · ${hoveredItem.clusterName}` : " · tanpa klaster"}
                </p>
              </div>
            ) : null}
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
          <MousePointerClick className="size-3.5" aria-hidden />
          Tap atau klik gelembung untuk melihat detail dan hubungannya. Angka di gelembung besar adalah porsi supply. Di HP, geser peta ke samping.
        </p>
      </Panel>

      <WalletDetail
        chain={chain}
        symbol={symbol}
        item={selectedItem}
        edges={edges}
        byKey={byKey}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function WalletDetail({
  chain,
  symbol,
  item,
  edges,
  byKey,
  onClose,
}: {
  chain: ChainId;
  symbol: string;
  item: ExplorerNode | undefined;
  edges: MapEdge[];
  byKey: Map<string, ExplorerNode>;
  onClose: () => void;
}) {
  if (!item) {
    return (
      <Panel id="detail-wallet" title="Detail wallet" description="Pilih gelembung di peta." icon={MousePointerClick} className="min-w-0">
        <p className="text-xs leading-relaxed text-muted">
          Detail wallet, klasternya, dan semua transfer yang menghubungkannya dengan wallet lain akan muncul di sini.
        </p>
      </Panel>
    );
  }
  const key = addressKey(chain, item.node.address);
  const related = edges.filter((edge) => addressKey(chain, edge.from) === key || addressKey(chain, edge.to) === key);

  return (
    <Panel
      id="detail-wallet"
      title={nodeName(item.node)}
      description={item.node.sharePct > 0 ? `Memegang ${formatPct(item.node.sharePct)} supply ${symbol}` : `Tidak memegang ${symbol}, muncul karena terhubung`}
      icon={MousePointerClick}
      className="min-w-0"
      action={
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup detail wallet"
          className="inline-grid size-7 place-items-center rounded-md text-muted transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="size-4" aria-hidden />
        </button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <HashLink value={item.node.address} href={explorerAddressUrl(chain, item.node.address)} copyLabel="Salin address" />
          <div className="flex flex-wrap items-center gap-1.5">
            {item.node.label ? <EntityLabelBadge label={item.node.label} /> : null}
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.clusterName ? `Klaster ${item.clusterName}` : "Tanpa klaster"}
            </span>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Hubungan ({related.length})
          </h3>
          {related.length === 0 ? (
            <p className="text-xs text-muted">Belum ada transfer ke atau dari wallet lain di peta.</p>
          ) : (
            <ul className="divide-y divide-line">
              {related.map((edge) => {
                const outgoing = addressKey(chain, edge.from) === key;
                const other = byKey.get(addressKey(chain, outgoing ? edge.to : edge.from));
                const Icon = outgoing ? ArrowUpRight : ArrowDownLeft;
                return (
                  <li key={edge.id} className="space-y-1 py-2 first:pt-0 last:pb-0">
                    <p className="flex items-center gap-1.5 text-xs">
                      <Icon className={cn("size-3.5", outgoing ? "text-orange-300" : "text-emerald-300")} aria-hidden />
                      <span className="text-muted">{outgoing ? "Ke" : "Dari"}</span>
                      <span className="truncate font-medium">{other ? nodeName(other.node) : shortenHash(outgoing ? edge.to : edge.from)}</span>
                    </p>
                    <p className="text-xs tabular-nums">
                      {formatTokenAmount(edge.amount, edge.asset.symbol)}
                      <span className="text-muted">
                        {" "}
                        · {edge.amountUsd !== undefined ? formatUsdCompact(edge.amountUsd) : "harga tidak diketahui"} ·{" "}
                        {edge.kind === "funding" ? "pendanaan" : "transfer token"}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <time dateTime={edge.timestamp} className="text-[11px] text-muted">
                        {formatDateTime(edge.timestamp)}
                      </time>
                      <HashLink value={edge.txHash} href={explorerTxUrl(chain, edge.txHash)} head={8} tail={4} copyLabel="Salin hash transaksi" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
