"use client";

import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  FileSearch,
  Crosshair,
  Eye,
  EyeOff,
  Highlighter,
  Maximize2,
  MousePointerClick,
  Network,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { EntityLabelBadge } from "@/components/badges";
import { ENTITY_ICONS } from "@/components/entity-label-badge";
import { ClassificationBadge } from "@/components/classification-badge";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { EvidenceProvider, EvidenceTrigger } from "@/components/evidence/evidence-dialog";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { evidenceFromCoordination, evidenceFromEdges, mergeEvidence } from "@/lib/evidence";
import { COORDINATION_KIND_META } from "@/lib/labels";
import { formatDateTime, formatPct, formatTokenAmount, formatUsdCompact, shortenHash } from "@/lib/format";
import { addressKey, addressTitle } from "@/lib/fund-flow";
import type { ChainId, CoordinationEvent, MapEdge, MapNode } from "@/lib/types";
import { CHART_SURFACE } from "@/lib/chart-colors";
import { fitBounds, INITIAL_VIEWPORT, MAX_SCALE, MIN_SCALE, toViewportPercent, viewBoxOf, type Viewport } from "@/lib/map-viewport";
import {
  clusterHull,
  coordinationMembership,
  EMPTY_LABEL_FILTER,
  hullLabelPosition,
  hullPath,
  isLabelFilterActive,
  LAYER_OPTIONS,
  labelFilterParams,
  layersFrom,
  matchesLabelFilter,
  NEUTRAL_NODE_COLOR,
  parseLabelFilter,
  type LabelFilter,
} from "@/lib/wallet-map";
import { CoordinationPanel } from "./coordination-panel";
import { CoordinationTxsPanel } from "./coordination-txs-panel";
import { LabelFilterBar } from "./label-filter-bar";
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
  /** Filter label dari URL (`?sembunyikan=` dan `?sumber=`), dibaca di sini. */
  initialLabelFilter?: { sembunyikan?: string; sumber?: string };
  /** Klaster sesuai urutan warna; `color` kosong untuk klaster yang digabung ke "lainnya". */
  clusters: Array<{ id: string; name: string; color: string | null }>;
  /** Kejadian gerak serempak di antara wallet peta. */
  coordination: CoordinationEvent[];
}

/** Perkiraan lebar satu huruf label 11px, untuk menaruh titik warna di depan label kelompok. */
const LABEL_CHAR_WIDTH = 6.2;

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

/** Simpan pilihan pusat, lapis, dan filter label di URL tanpa memuat ulang halaman. */
function syncUrl(centerAddress: string | null, depth: number | null, filter: LabelFilter) {
  const url = new URL(window.location.href);
  const params: Record<string, string | undefined> = {
    pusat: centerAddress ?? undefined,
    lapis: centerAddress && depth !== null ? String(depth) : undefined,
    ...labelFilterParams(filter),
  };
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
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

export function WalletMapExplorer({
  chain,
  symbol,
  nodes,
  edges,
  initialCenter,
  initialDepth,
  initialLabelFilter,
  clusters,
  coordination,
}: WalletMapExplorerProps) {
  const markerId = useId().replace(/:/g, "");
  const hintId = useId();
  const centerSelectId = useId();

  const initialCenterKey =
    initialCenter && nodes.some((item) => addressKey(chain, item.node.address) === addressKey(chain, initialCenter))
      ? addressKey(chain, initialCenter)
      : null;
  const [center, setCenter] = useState<string | null>(initialCenterKey);
  const [depth, setDepth] = useState<number | null>(initialCenterKey ? initialDepth : (initialDepth ?? DEFAULT_DEPTH));

  const [labelFilter, setLabelFilter] = useState<LabelFilter>(() =>
    initialLabelFilter ? parseLabelFilter(initialLabelFilter.sembunyikan, initialLabelFilter.sumber) : EMPTY_LABEL_FILTER,
  );

  /**
   * Gelembung yang tampil untuk pusat, kedalaman, dan filter label tertentu.
   * Wallet pusat selalu tampil walau jenis labelnya disaring.
   */
  function visibleFor(nextCenter: string | null, nextDepth: number | null, nextFilter: LabelFilter) {
    const layers = nextCenter ? layersFrom(chain, edges, nextCenter, nextDepth) : null;
    const items = nodes.filter((item) => {
      const key = addressKey(chain, item.node.address);
      if (layers && !layers.has(key)) return false;
      return key === nextCenter || matchesLabelFilter(item.node, nextFilter);
    });
    return { layers, items, keys: new Set(items.map((item) => addressKey(chain, item.node.address))) };
  }

  const initialVisible = visibleFor(initialCenterKey, initialCenterKey ? initialDepth : null, labelFilter);
  const { svgRef, viewport, dragging, zoomIn, zoomOut, reset, isDragClick, svgProps, onKeyDown, showViewport } = usePanZoom(
    viewportFor(initialVisible.items, nodes.length),
  );
  const { layers, items: visibleNodes, keys: visibleKeys } = useMemo(
    () => visibleFor(center, depth, labelFilter),
    // visibleFor hanya memakai chain, edges, dan nodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chain, edges, nodes, center, depth, labelFilter],
  );
  const isVisible = (address: string) => visibleKeys.has(addressKey(chain, address));
  const filtering = center !== null || isLabelFilterActive(labelFilter);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(nodes.map((item) => [addressKey(chain, item.node.address), item])), [chain, nodes]);
  const evidence = useMemo(() => {
    const mapNodes = nodes.map((item) => item.node);
    return mergeEvidence(evidenceFromEdges(chain, edges, mapNodes), evidenceFromCoordination(chain, coordination, mapNodes));
  }, [chain, edges, nodes, coordination]);
  const labelsByKey = useMemo(
    () => new Map(nodes.map((item) => [addressKey(chain, item.node.address), item.node.label])),
    [chain, nodes],
  );
  const selectedEdge = selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) : undefined;

  /**
   * Yang sedang disorot: gelembung yang di-hover, lalu garis yang dipilih,
   * lalu gelembung yang dipilih. Garis aktif dan gelembung di ujungnya terang,
   * sisanya diredupkan.
   */
  const [showGroups, setShowGroups] = useState(true);
  const [focusCluster, setFocusCluster] = useState<string | null>(null);
  const [focusCoordination, setFocusCoordination] = useState<string | null>(null);
  const [showCoordination, setShowCoordination] = useState(true);
  const [txEventId, setTxEventId] = useState<string | null>(null);
  const coordinationOf = useMemo(() => coordinationMembership(chain, { coordination }), [chain, coordination]);

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
    if (focusCluster) {
      const members = new Set(
        nodes.filter((item) => item.node.clusterId === focusCluster).map((item) => addressKey(chain, item.node.address)),
      );
      const active = new Set(
        edges
          .filter((edge) => members.has(addressKey(chain, edge.from)) && members.has(addressKey(chain, edge.to)))
          .map((edge) => edge.id),
      );
      return { edges: active, nodes: members };
    }
    const event = focusCoordination ? coordination.find((item) => item.id === focusCoordination) : undefined;
    if (event) {
      const members = new Set(event.members.map((member) => addressKey(chain, member)));
      const active = new Set(
        edges
          .filter((edge) => members.has(addressKey(chain, edge.from)) && members.has(addressKey(chain, edge.to)))
          .map((edge) => edge.id),
      );
      return { edges: active, nodes: members };
    }
    return null;
  }, [chain, edges, nodes, hovered, selected, selectedEdge, focusCluster, focusCoordination, coordination]);

  /** Area dan label tiap kelompok, hanya dari anggota yang sedang tampil. */
  const groups = useMemo(
    () =>
      clusters.flatMap((cluster) => {
        const members = visibleNodes.filter((item) => item.node.clusterId === cluster.id);
        if (members.length === 0) return [];
        const hull = clusterHull(members);
        return [{ ...cluster, count: members.length, path: hullPath(hull), label: hullLabelPosition(hull) }];
      }),
    [clusters, visibleNodes],
  );

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

  /**
   * Terapkan pusat, kedalaman, dan filter label. Pilihan yang ikut
   * tersembunyi dilepas, dan (bila `fit`) peta diarahkan ke wallet yang tampil.
   */
  function applyView(nextCenter: string | null, nextDepth: number | null, nextFilter: LabelFilter, fit: boolean) {
    setCenter(nextCenter);
    setDepth(nextDepth);
    setLabelFilter(nextFilter);
    setHovered(null);
    const next = visibleFor(nextCenter, nextDepth, nextFilter);
    if (fit) showViewport(viewportFor(next.items, nodes.length));
    if (selected && !next.keys.has(selected)) setSelected(null);
    if (selectedEdge && !(next.keys.has(addressKey(chain, selectedEdge.from)) && next.keys.has(addressKey(chain, selectedEdge.to)))) {
      setSelectedEdgeId(null);
    }
    syncUrl(nextCenter ? (byKey.get(nextCenter)?.node.address ?? null) : null, nextDepth, nextFilter);
  }

  /** Ganti wallet pusat atau kedalaman, lalu arahkan peta ke wallet yang tampil. */
  function applyFocus(nextCenter: string | null, nextDepth: number | null) {
    applyView(nextCenter, nextDepth, labelFilter, true);
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
              {filtering ? `${visibleNodes.length} dari ${nodes.length} wallet tampil` : `${nodes.length} wallet`}
            </p>
          </div>

          <LabelFilterBar
            nodes={nodes.map((item) => item.node)}
            filter={labelFilter}
            onChange={(next) => applyView(center, depth, next, false)}
          />

          {clusters.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Kelompok wallet">
              <span className="text-[11px] text-muted">Kelompok:</span>
              {clusters.map((cluster) => {
                const active = focusCluster === cluster.id;
                const count = nodes.filter((item) => item.node.clusterId === cluster.id).length;
                return (
                  <button
                    key={cluster.id}
                    type="button"
                    aria-pressed={active}
                    title={active ? "Klik lagi untuk berhenti menyorot" : "Sorot anggota kelompok ini"}
                    onClick={() => {
                      setFocusCluster(active ? null : cluster.id);
                      setFocusCoordination(null);
                      setSelected(null);
                      setSelectedEdgeId(null);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      active ? "bg-surface text-foreground ring-foreground/50" : "bg-surface-raised text-foreground/80 ring-line hover:text-foreground",
                    )}
                  >
                    <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: cluster.color ?? NEUTRAL_NODE_COLOR }} />
                    {cluster.name}
                    <span className="tabular-nums text-muted">{count}</span>
                  </button>
                );
              })}
              <span className="inline-flex items-center gap-1.5 px-1 text-xs text-muted">
                <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: NEUTRAL_NODE_COLOR }} />
                Tanpa klaster
              </span>
              <button
                type="button"
                aria-pressed={showGroups}
                onClick={() => setShowGroups((value) => !value)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
              >
                {showGroups ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                Area kelompok
              </button>
            </div>
          ) : null}

          <div
            className="-mx-2 sm:mx-0"
            onKeyDown={(event) => {
              if (onKeyDown(event)) setHovered(null);
            }}
          >
            {edges.length === 0 ? (
              <p className="mb-2 rounded-lg bg-surface-raised px-3 py-2 text-[11px] text-muted">
                Belum ada transfer di antara wallet peta ini, jadi belum ada garis hubungan.
              </p>
            ) : null}
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
                {showGroups ? (
                  <g aria-hidden className="pointer-events-none">
                    {groups.map((group) => {
                      const color = group.color ?? NEUTRAL_NODE_COLOR;
                      const dimmed = focusCluster !== null && focusCluster !== group.id;
                      const textWidth = group.name.length * LABEL_CHAR_WIDTH;
                      return (
                        <g key={group.id} opacity={dimmed ? 0.3 : 1}>
                          <path
                            d={group.path}
                            fill={color}
                            fillOpacity={focusCluster === group.id ? 0.14 : 0.07}
                            stroke={color}
                            strokeOpacity={0.6}
                            strokeWidth={1}
                            strokeDasharray="4 3"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                          />
                          <circle cx={group.label.x - textWidth / 2 - 7} cy={group.label.y - 4} r={3.5} fill={color} />
                          <text
                            x={group.label.x}
                            y={group.label.y}
                            textAnchor="middle"
                            stroke={CHART_SURFACE}
                            strokeWidth={3}
                            strokeOpacity={0.8}
                            vectorEffect="non-scaling-stroke"
                            style={{ paintOrder: "stroke" }}
                            className="fill-foreground/85 text-[11px] font-medium"
                          >
                            {group.name}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                ) : null}
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
                      aria-label={`${nodeName(item.node)}, ${holder ? `${formatPct(item.node.sharePct)} supply` : "bukan holder"}${item.clusterName ? `, klaster ${item.clusterName}` : ""}${key === center ? ", wallet pusat" : layers ? `, lapis ${layers.get(key)}` : ""}${coordinationOf.has(key) ? ", terlibat gerak serempak" : ""}`}
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
                      {item.node.label && item.node.label.type !== "unknown" ? (
                        <EntityMarker x={item.x} y={item.y} r={item.r} type={item.node.label.type} heuristic={item.node.label.source === "heuristic"} />
                      ) : null}
                      {showCoordination && coordinationOf.has(key) ? (
                        <CoordinationMarker x={item.x} y={item.y} r={item.r} />
                      ) : null}
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

              {visibleNodes.length === 0 ? (
                <div className="absolute inset-0 grid place-items-center p-4">
                  <div role="status" className="max-w-xs rounded-lg border border-line bg-surface-raised/95 px-4 py-3 text-center shadow-xl shadow-black/40">
                    <p className="text-sm font-medium">Tidak ada wallet yang cocok</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      Pilihan wallet pusat atau filter label menyembunyikan semua wallet di peta ini.
                    </p>
                    <button
                      type="button"
                      onClick={() => applyView(null, depth, EMPTY_LABEL_FILTER, true)}
                      className="mt-3 inline-flex items-center rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Tampilkan semua wallet
                    </button>
                  </div>
                </div>
              ) : null}

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
                  {hoveredItem.node.label ? (
                    <p className="mt-0.5 text-[11px] text-muted">
                      Label {hoveredItem.node.label.source === "external" ? "eksternal" : "dugaan OpenChain"} ·{" "}
                      {hoveredItem.node.label.sourceName}
                    </p>
                  ) : null}
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

        <div className="min-w-0 space-y-5">
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
            coordination={selected ? coordination.filter((event) => coordinationOf.get(selected)?.includes(event.id)) : []}
              onMakeCenter={(key) => applyFocus(key, depth ?? DEFAULT_DEPTH)}
              onClose={() => setSelected(null)}
              onSelectEdge={(id) => {
                setSelectedEdgeId(id);
                revealPanel("bukti-garis");
              }}
            />
          )}
          <CoordinationPanel
            chain={chain}
            events={coordination}
            focusedId={focusCoordination}
            onFocus={(id) => {
              setFocusCoordination(id);
              if (id) setTxEventId(id);
              setFocusCluster(null);
              setSelected(null);
              setSelectedEdgeId(null);
            }}
            showMarkers={showCoordination}
            onToggleMarkers={() => setShowCoordination((value) => !value)}
            onShowTransactions={(id) => {
              setTxEventId(id);
              requestAnimationFrame(() =>
                document.getElementById("transaksi-koordinasi")?.scrollIntoView({ behavior: "smooth", block: "start" }),
              );
            }}
          />
        </div>
      </div>
      {coordination.length > 0 ? (
        <div className="mt-5">
          <CoordinationTxsPanel
            chain={chain}
            events={coordination}
            activeId={txEventId}
            onSelect={setTxEventId}
            labels={labelsByKey}
          />
        </div>
      ) : null}
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

/**
 * Penanda kecil jenis entitas di tepi kanan atas gelembung berlabel. Garis
 * tepinya putus-putus bila labelnya dugaan OpenChain, utuh bila eksternal.
 */
function EntityMarker({
  x,
  y,
  r,
  type,
  heuristic,
}: {
  x: number;
  y: number;
  r: number;
  type: keyof typeof ENTITY_ICONS;
  heuristic: boolean;
}) {
  const Icon = ENTITY_ICONS[type];
  const cx = x + r * Math.SQRT1_2;
  const cy = y - r * Math.SQRT1_2;
  return (
    <g pointerEvents="none" aria-hidden>
      <circle
        cx={cx}
        cy={cy}
        r={7.5}
        fill={CHART_SURFACE}
        stroke="var(--foreground)"
        strokeOpacity={0.55}
        strokeWidth={1}
        strokeDasharray={heuristic ? "2 1.5" : undefined}
        vectorEffect="non-scaling-stroke"
      />
      <Icon x={cx - 4.5} y={cy - 4.5} width={9} height={9} strokeWidth={2.4} className="text-foreground/85" />
    </g>
  );
}

/** Penanda petir di kanan bawah gelembung yang terlibat gerak serempak. */
function CoordinationMarker({ x, y, r }: { x: number; y: number; r: number }) {
  const cx = x + r * Math.SQRT1_2;
  const cy = y + r * Math.SQRT1_2;
  return (
    <g pointerEvents="none" aria-hidden>
      <circle cx={cx} cy={cy} r={7.5} fill={CHART_SURFACE} stroke="var(--foreground)" strokeOpacity={0.55} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <Zap x={cx - 4.5} y={cy - 4.5} width={9} height={9} strokeWidth={2.4} className="text-foreground/85" />
    </g>
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
  coordination,
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
  /** Kejadian gerak serempak yang melibatkan wallet ini. */
  coordination: CoordinationEvent[];
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

        {coordination.length > 0 ? (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Gerak serempak</h3>
            <ul className="space-y-1.5">
              {coordination.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <Zap className="size-3.5 text-foreground/80" aria-hidden />
                    {COORDINATION_KIND_META[event.kind].label}
                  </span>
                  <ConfidenceMeter confidence={event.confidence} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Hubungan ({related.length})</h3>
            {related.length > 0 ? <ClassificationBadge classification="fact" /> : null}
          </div>
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
