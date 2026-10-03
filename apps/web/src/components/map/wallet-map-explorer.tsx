"use client";

import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  FileSearch,
  Crosshair,
  Highlighter,
  Maximize2,
  MousePointerClick,
  Network,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { EntityLabelBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { EvidenceProvider, EvidenceTrigger } from "@/components/evidence/evidence-dialog";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { evidenceFromEdges } from "@/lib/evidence";
import { formatDateTime, formatPct, formatTokenAmount, formatUsdCompact, shortenHash } from "@/lib/format";
import { addressKey, addressTitle } from "@/lib/fund-flow";
import type { ChainId, MapEdge, MapNode } from "@/lib/types";
import { CHART_SURFACE } from "@/lib/chart-colors";
import { fitBounds, INITIAL_VIEWPORT, MAX_SCALE, MIN_SCALE, toViewportPercent, viewBoxOf, type Viewport } from "@/lib/map-viewport";
import { LAYER_OPTIONS, layersFrom } from "@/lib/wallet-map";
import { usePanZoom } from "./use-pan-zoom";

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
  /** Wallet pusat dari URL (`?pusat=`); diabaikan bila tidak ada di peta. */
  initialCenter?: string;
  /** Kedalaman lapis dari URL (`?lapis=`); `null` = semua lapis. */
  initialDepth: number | null;
}

/** Kedalaman awal saat wallet pusat pertama kali dipilih. */
const DEFAULT_DEPTH = 2;

const EDGE_COLOR = "#3a4a63";
const EDGE_ACTIVE_COLOR = "#8b9bb2";
/** Garis yang dipilih memakai warna teks, bukan warna klaster, supaya tidak tertukar. */
const EDGE_SELECTED_COLOR = "#e6edf6";
/** Lebar area klik garis (px layar), jauh lebih lebar dari garisnya. */
const EDGE_HIT_WIDTH = 14;
/** Gelembung sebesar ini atau lebih diberi label langsung di dalamnya. */
const LABEL_MIN_RADIUS = 22;

function nodeName(node: MapNode): string {
  return node.label ? addressTitle(node.label) : shortenHash(node.address, 4, 4);
}

/** Viewport yang memuat semua gelembung `items`; seluruh peta bila semuanya tampil. */
function viewportFor(items: ExplorerNode[], total: number): Viewport {
  if (items.length === 0 || items.length === total) return INITIAL_VIEWPORT;
  return fitBounds({
    left: Math.min(...items.map((item) => item.x - item.r)),
    top: Math.min(...items.map((item) => item.y - item.r)),
    right: Math.max(...items.map((item) => item.x + item.r)),
    bottom: Math.max(...items.map((item) => item.y + item.r)),
  });
}

/** "Wallet pusat" atau "Lapis 2 dari pusat". */
function layerText(layer: number): string {
  return layer === 0 ? "wallet pusat" : `lapis ${layer} dari pusat`;
}

function layerLabel(depth: number | null): string {
  return depth === null ? "Semua" : `${depth} lapis`;
}

/** Simpan pilihan pusat dan lapis di URL tanpa memuat ulang halaman. */
function syncUrl(centerAddress: string | null, depth: number | null) {
  const url = new URL(window.location.href);
  if (centerAddress) url.searchParams.set("pusat", centerAddress);
  else url.searchParams.delete("pusat");
  if (centerAddress && depth !== null) url.searchParams.set("lapis", String(depth));
  else url.searchParams.delete("lapis");
  window.history.replaceState(window.history.state, "", url);
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

export function WalletMapExplorer({ chain, symbol, nodes, edges, initialCenter, initialDepth }: WalletMapExplorerProps) {
  const markerId = useId().replace(/:/g, "");
  const hintId = useId();
  const centerSelectId = useId();

  const initialCenterKey =
    initialCenter && nodes.some((item) => addressKey(chain, item.node.address) === addressKey(chain, initialCenter))
      ? addressKey(chain, initialCenter)
      : null;
  const [center, setCenter] = useState<string | null>(initialCenterKey);
  const [depth, setDepth] = useState<number | null>(initialCenterKey ? initialDepth : (initialDepth ?? DEFAULT_DEPTH));

  /** Gelembung yang tampil untuk pusat dan kedalaman tertentu. */
  function visibleFor(nextCenter: string | null, nextDepth: number | null) {
    if (!nextCenter) return { layers: null, items: nodes };
    const layers = layersFrom(chain, edges, nextCenter, nextDepth);
    return { layers, items: nodes.filter((item) => layers.has(addressKey(chain, item.node.address))) };
  }

  const initialVisible = visibleFor(initialCenterKey, initialCenterKey ? initialDepth : null);
  const { svgRef, viewport, dragging, zoomIn, zoomOut, reset, isDragClick, svgProps, onKeyDown, showViewport } = usePanZoom(
    viewportFor(initialVisible.items, nodes.length),
  );
  const { layers, items: visibleNodes } = useMemo(
    () => (center ? visibleFor(center, depth) : { layers: null, items: nodes }),
    // visibleFor hanya memakai chain, edges, dan nodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chain, edges, nodes, center, depth],
  );
  const isVisible = (address: string) => !layers || layers.has(addressKey(chain, address));
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(nodes.map((item) => [addressKey(chain, item.node.address), item])), [chain, nodes]);
  const evidence = useMemo(() => evidenceFromEdges(chain, edges, nodes.map((item) => item.node)), [chain, edges, nodes]);
  const selectedEdge = selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) : undefined;

  /**
   * Yang sedang disorot: gelembung yang di-hover, lalu garis yang dipilih,
   * lalu gelembung yang dipilih. Garis aktif dan gelembung di ujungnya terang,
   * sisanya diredupkan.
   */
  const highlight = useMemo(() => {
    const nodeKey = hovered ?? (selectedEdge ? null : selected);
    if (nodeKey) {
      const active = new Set<string>();
      const keys = new Set([nodeKey]);
      for (const edge of edges) {
        const from = addressKey(chain, edge.from);
        const to = addressKey(chain, edge.to);
        if (from === nodeKey || to === nodeKey) {
          active.add(edge.id);
          keys.add(from);
          keys.add(to);
        }
      }
      return { edges: active, nodes: keys };
    }
    if (selectedEdge) {
      return {
        edges: new Set([selectedEdge.id]),
        nodes: new Set([addressKey(chain, selectedEdge.from), addressKey(chain, selectedEdge.to)]),
      };
    }
    return null;
  }, [chain, edges, hovered, selected, selectedEdge]);

  useEffect(() => {
    if (!selected && !selectedEdgeId) return;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
      setSelected(null);
      setSelectedEdgeId(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, selectedEdgeId]);

  const hoveredItem = hovered ? byKey.get(hovered) : undefined;
  const selectedItem = selected ? byKey.get(selected) : undefined;

  /** Di layar sempit panel samping ada di bawah peta; bawa ke sana supaya terlihat. */
  function revealPanel(id: string) {
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  /** Ganti wallet pusat atau kedalaman, lalu arahkan peta ke wallet yang tampil. */
  function applyFocus(nextCenter: string | null, nextDepth: number | null) {
    setCenter(nextCenter);
    setDepth(nextDepth);
    setHovered(null);
    const next = visibleFor(nextCenter, nextDepth);
    showViewport(viewportFor(next.items, nodes.length));
    const shown = (key: string) => !next.layers || next.layers.has(key);
    if (selected && !shown(selected)) setSelected(null);
    if (selectedEdge && !(shown(addressKey(chain, selectedEdge.from)) && shown(addressKey(chain, selectedEdge.to)))) {
      setSelectedEdgeId(null);
    }
    syncUrl(nextCenter ? (byKey.get(nextCenter)?.node.address ?? null) : null, nextDepth);
  }

  function select(key: string) {
    if (isDragClick()) return;
    const next = selected === key && !selectedEdgeId ? null : key;
    setSelected(next);
    setSelectedEdgeId(null);
    if (next) revealPanel("detail-wallet");
  }

  function selectEdge(id: string) {
    if (isDragClick()) return;
    const next = selectedEdgeId === id ? null : id;
    setSelectedEdgeId(next);
    if (next) revealPanel("bukti-garis");
  }

  function onNodeKey(event: KeyboardEvent<SVGGElement>, key: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(key);
    }
  }

  return (
    <EvidenceProvider evidence={evidence}>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <Panel
          id="peta"
          title="Peta hubungan"
          description="Gelembung = wallet, besarnya sebanding porsi supply. Garis = transfer di antara wallet."
          icon={Network}
          className="min-w-0 lg:col-span-2"
          action={<ClassificationBadge classification="heuristic" />}
        >
          <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-2">
            <label htmlFor={centerSelectId} className="grid min-w-0 gap-1 text-[11px] text-muted">
              Wallet pusat
              <select
                id={centerSelectId}
                value={center ?? ""}
                onChange={(event) => applyFocus(event.target.value || null, depth ?? (event.target.value ? DEFAULT_DEPTH : null))}
                className="max-w-[16rem] rounded-lg border border-line bg-surface-raised px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-accent"
              >
                <option value="">Tanpa pusat (seluruh peta)</option>
                {[...nodes]
                  .sort((a, b) => b.node.sharePct - a.node.sharePct)
                  .map((item) => (
                    <option key={item.node.address} value={addressKey(chain, item.node.address)}>
                      {nodeName(item.node)} · {shortenHash(item.node.address, 4, 4)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="grid gap-1 text-[11px] text-muted">
              <span id={`${centerSelectId}-lapis`}>Kedalaman</span>
              <div role="group" aria-labelledby={`${centerSelectId}-lapis`} className="inline-flex rounded-lg border border-line bg-surface-raised p-0.5">
                {LAYER_OPTIONS.map((option) => (
                  <button
                    key={String(option)}
                    type="button"
                    disabled={!center}
                    aria-pressed={center ? depth === option : false}
                    onClick={() => applyFocus(center, option)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
                      center && depth === option ? "bg-surface text-foreground shadow-sm ring-1 ring-line" : "text-muted hover:text-foreground",
                    )}
                  >
                    {layerLabel(option)}
                  </button>
                ))}
              </div>
            </div>
            <p className="pb-1.5 text-[11px] text-muted" aria-live="polite">
              {center ? `${visibleNodes.length} dari ${nodes.length} wallet tampil` : `${nodes.length} wallet`}
            </p>
          </div>

          <div
            className="-mx-2 sm:mx-0"
            onKeyDown={(event) => {
              if (onKeyDown(event)) setHovered(null);
            }}
          >
            <div className="relative overflow-hidden rounded-lg">
              <svg
                ref={svgRef}
                viewBox={viewBoxOf(viewport)}
                className={cn(
                  "block h-auto w-full select-none",
                  viewport.scale > 1 ? (dragging ? "cursor-grabbing" : "cursor-grab") : undefined,
                )}
                // Saat diperbesar, sentuhan dipakai untuk menggeser peta; saat belum, untuk menggulir halaman.
                style={{ touchAction: viewport.scale > 1 ? "none" : "pan-y" }}
                role="group"
                aria-label={`Peta hubungan ${nodes.length} wallet holder ${symbol}`}
                aria-describedby={hintId}
                onPointerLeave={() => setHovered(null)}
                {...svgProps}
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
                    if (!from || !to || !isVisible(edge.from) || !isVisible(edge.to)) return null;
                    const ends = edgeEnds(from, to);
                    const active = highlight?.edges.has(edge.id) ?? false;
                    const isSelected = edge.id === selectedEdgeId;
                    return (
                      <g key={edge.id} opacity={highlight && !active ? 0.25 : 1}>
                        <line
                          {...ends}
                          stroke={isSelected ? EDGE_SELECTED_COLOR : active ? EDGE_ACTIVE_COLOR : EDGE_COLOR}
                          strokeWidth={isSelected ? 2.5 : active ? 2 : 1.5}
                          strokeDasharray={edge.kind === "funding" ? "5 4" : undefined}
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                          markerEnd={active ? `url(#${markerId})` : undefined}
                        />
                        {/* Area klik transparan yang lebar; garisnya sendiri terlalu tipis untuk di-tap. */}
                        <line
                          {...ends}
                          stroke="transparent"
                          strokeWidth={EDGE_HIT_WIDTH}
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="stroke"
                          className="cursor-pointer"
                          onClick={() => selectEdge(edge.id)}
                        />
                      </g>
                    );
                  })}
                </g>
                {visibleNodes.map((item) => {
                  const key = addressKey(chain, item.node.address);
                  const dimmed = highlight !== null && !highlight.nodes.has(key);
                  const isSelected = selected === key;
                  const holder = item.node.sharePct > 0;
                  const showLabel = item.r >= LABEL_MIN_RADIUS;
                  return (
                    <g
                      key={key}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`${nodeName(item.node)}, ${holder ? `${formatPct(item.node.sharePct)} supply` : "bukan holder"}${item.clusterName ? `, klaster ${item.clusterName}` : ""}${key === center ? ", wallet pusat" : layers ? `, lapis ${layers.get(key)}` : ""}`}
                      className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-accent"
                      opacity={dimmed ? 0.3 : 1}
                      onPointerEnter={(event) => {
                        if (event.pointerType === "mouse" && !dragging) setHovered(key);
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
                        vectorEffect="non-scaling-stroke"
                      />
                      {key === center ? (
                        <circle
                          cx={item.x}
                          cy={item.y}
                          r={item.r + 8}
                          fill="none"
                          stroke="var(--color-accent)"
                          strokeWidth={1.5}
                          strokeDasharray="3 3"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}
                      {isSelected ? (
                        <circle cx={item.x} cy={item.y} r={item.r + 4} fill="none" stroke="var(--foreground)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
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
                          vectorEffect="non-scaling-stroke"
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

              <div className="absolute top-2 right-2 flex flex-col items-center gap-1 rounded-lg border border-line bg-surface-raised/90 p-1 backdrop-blur">
                <MapControl label="Perbesar" onClick={zoomIn} disabled={viewport.scale >= MAX_SCALE} icon={ZoomIn} />
                <MapControl label="Perkecil" onClick={zoomOut} disabled={viewport.scale <= MIN_SCALE} icon={ZoomOut} />
                <MapControl label="Tampilkan seluruh peta" onClick={reset} disabled={viewport.scale <= MIN_SCALE} icon={Maximize2} />
                <span className="px-0.5 pb-0.5 text-[10px] tabular-nums text-muted" aria-live="polite">
                  {Math.round(viewport.scale * 100)}%
                </span>
              </div>

              {hoveredItem && !dragging ? (
                <div
                  role="tooltip"
                  style={(() => {
                    const position = toViewportPercent(viewport, hoveredItem.x, hoveredItem.y - hoveredItem.r);
                    return { left: `${position.left}%`, top: `${position.top}%` };
                  })()}
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
                    {layers ? ` · ${layerText(layers.get(hovered!) ?? 0)}` : ""}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
            <MousePointerClick className="size-3.5" aria-hidden />
            <span id={hintId}>
              Tap atau klik gelembung untuk melihat detail. Perbesar dengan tombol +/−, Ctrl/⌘ + scroll, atau dua
              jari, lalu seret untuk menggeser. Keyboard: + − 0 dan panah.
            </span>
          </p>
        </Panel>

        {selectedEdge ? (
          <EdgeEvidencePanel chain={chain} edge={selectedEdge} byKey={byKey} onClose={() => setSelectedEdgeId(null)} />
        ) : (
          <WalletDetail
            chain={chain}
            symbol={symbol}
            item={selectedItem}
            edges={edges}
            byKey={byKey}
            layer={selected && layers ? layers.get(selected) : undefined}
            isCenter={selected !== null && selected === center}
            onMakeCenter={(key) => applyFocus(key, depth ?? DEFAULT_DEPTH)}
            onClose={() => setSelected(null)}
            onSelectEdge={(id) => {
              setSelectedEdgeId(id);
              revealPanel("bukti-garis");
            }}
          />
        )}
      </div>
    </EvidenceProvider>
  );
}

/** Bukti satu garis: transfer yang menghubungkan dua wallet di peta. */
function EdgeEvidencePanel({
  chain,
  edge,
  byKey,
  onClose,
}: {
  chain: ChainId;
  edge: MapEdge;
  byKey: Map<string, ExplorerNode>;
  onClose: () => void;
}) {
  const from = byKey.get(addressKey(chain, edge.from));
  const to = byKey.get(addressKey(chain, edge.to));
  return (
    <Panel
      id="bukti-garis"
      title="Bukti transaksi"
      description={edge.kind === "funding" ? "Pendanaan native coin di antara dua wallet." : "Transfer token di antara dua wallet."}
      icon={FileSearch}
      className="min-w-0"
      action={
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup bukti transaksi"
          className="inline-grid size-7 place-items-center rounded-md text-muted transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="size-4" aria-hidden />
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-semibold tabular-nums">
            {formatTokenAmount(edge.amount, edge.asset.symbol)}
            <span className="text-xs font-normal text-muted">
              {" "}
              · {edge.amountUsd !== undefined ? formatUsdCompact(edge.amountUsd) : "harga tidak diketahui"}
            </span>
          </p>
          <ClassificationBadge classification="fact" />
        </div>

        <ol className="space-y-2">
          {[
            { role: "Pengirim", address: edge.from, item: from },
            { role: "Penerima", address: edge.to, item: to },
          ].map((party, index) => (
            <li key={party.role} className="rounded-lg border border-line px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-muted">
                {index === 1 ? <ArrowRight className="size-3" aria-hidden /> : null}
                {party.role}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
                {party.item ? (
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: party.item.color }} />
                ) : null}
                <span className="truncate">{party.item ? nodeName(party.item.node) : shortenHash(party.address)}</span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <HashLink value={party.address} href={explorerAddressUrl(chain, party.address)} copyLabel={`Salin address ${party.role.toLowerCase()}`} />
                {party.item?.node.label ? <EntityLabelBadge label={party.item.node.label} /> : null}
              </div>
            </li>
          ))}
        </ol>

        <dl className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Waktu</dt>
            <dd>
              <time dateTime={edge.timestamp}>{formatDateTime(edge.timestamp)}</time>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Hash transaksi</dt>
            <dd>
              <EvidenceTrigger txHash={edge.txHash} />
            </dd>
          </div>
        </dl>

        <a
          href={explorerTxUrl(chain, edge.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          Buka transaksi di explorer
        </a>
        <p className="text-[11px] leading-relaxed text-muted">
          Klik hash untuk bukti lengkap dan tautan yang bisa dibagikan. Garis menunjukkan transfer yang tercatat;
          apakah kedua wallet dikendalikan pihak yang sama tetap dugaan.
        </p>
      </div>
    </Panel>
  );
}

function MapControl({
  label,
  onClick,
  disabled,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  icon: typeof ZoomIn;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-grid size-8 place-items-center rounded-md text-foreground/80 transition hover:bg-surface hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground/80"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function WalletDetail({
  chain,
  symbol,
  item,
  edges,
  byKey,
  layer,
  isCenter,
  onMakeCenter,
  onClose,
  onSelectEdge,
}: {
  chain: ChainId;
  symbol: string;
  item: ExplorerNode | undefined;
  edges: MapEdge[];
  byKey: Map<string, ExplorerNode>;
  /** Jarak lapis dari wallet pusat, bila sedang menelusuri. */
  layer?: number;
  isCenter: boolean;
  onMakeCenter: (key: string) => void;
  onClose: () => void;
  onSelectEdge: (id: string) => void;
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
              {layer !== undefined ? ` · ${layerText(layer)}` : ""}
            </span>
          </div>
          <button
            type="button"
            disabled={isCenter}
            onClick={() => onMakeCenter(key)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:border-accent/40 disabled:text-accent"
          >
            <Crosshair className="size-3.5" aria-hidden />
            {isCenter ? "Pusat penelusuran" : "Jadikan pusat"}
          </button>
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
                      <EvidenceTrigger txHash={edge.txHash} />
                      <button
                        type="button"
                        onClick={() => onSelectEdge(edge.id)}
                        className="inline-flex items-center gap-1 rounded text-[11px] text-muted underline-offset-2 transition hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <Highlighter className="size-3" aria-hidden />
                        Sorot garis
                      </button>
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
