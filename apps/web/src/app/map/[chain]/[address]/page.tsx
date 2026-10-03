import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ClustersPanel, MapLegendPanel } from "@/components/map/clusters-panel";
import { MapEmptyPanel } from "@/components/map/map-empty-panel";
import { MapHeader } from "@/components/map/map-header";
import { MapStats } from "@/components/map/map-stats";
import { MapTable } from "@/components/map/map-table";
import { WalletMapExplorer, type ExplorerNode } from "@/components/map/wallet-map-explorer";
import { MockDataNotice } from "@/components/mock-data-notice";
import { ClassificationLegend } from "@/components/token/classification-legend";
import { getWalletMap } from "@/lib/api/maps";
import { isChainId } from "@/lib/chains";
import { firstParam } from "@/lib/flow-filter";
import { clusterStyles, edgesOf, layoutWalletMap, nodeColor, parseLayerParam, summarizeMap } from "@/lib/wallet-map";

/** Dipakai bersama oleh generateMetadata & Page; `cache` mencegah fetch ganda. */
const loadMap = cache(async (chain: string, address: string) => {
  if (!isChainId(chain)) return null;
  return getWalletMap(chain, address);
});

export async function generateMetadata({ params }: PageProps<"/map/[chain]/[address]">): Promise<Metadata> {
  const { chain, address } = await params;
  const map = await loadMap(chain, address);
  if (!map) return { title: "Peta tidak ditemukan" };
  return {
    title: `Peta hubungan holder ${map.token.symbol}`,
    description: `Hubungan antar-holder ${map.token.name}: klaster, pendanaan, dan transfer antar wallet.`,
  };
}

export default async function MapPage({ params, searchParams }: PageProps<"/map/[chain]/[address]">) {
  const [{ chain, address }, query] = await Promise.all([params, searchParams]);
  const map = await loadMap(chain, address);
  if (!map) notFound();

  const styles = clusterStyles(map);
  const clusterNames = new Map(map.clusters.map((cluster) => [cluster.id, cluster.name]));
  const nodes: ExplorerNode[] = layoutWalletMap(map).map((placed) => ({
    ...placed,
    color: nodeColor(placed.node, styles),
    clusterName: placed.node.clusterId ? clusterNames.get(placed.node.clusterId) : undefined,
  }));
  const connections = Object.fromEntries(
    map.nodes.map((node) => [node.address, edgesOf(map.chain, map.edges, node.address).length]),
  );

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <MapHeader map={map} />
      <MapStats summary={summarizeMap(map)} />
      {map.nodes.length === 0 ? (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <MapEmptyPanel chain={map.chain} token={map.token.address} symbol={map.token.symbol} />
          </div>
          <aside className="min-w-0" aria-label="Keterangan">
            <ClassificationLegend />
          </aside>
        </div>
      ) : (
        <>
          <WalletMapExplorer
            chain={map.chain}
            symbol={map.token.symbol}
            nodes={nodes}
            edges={map.edges}
            initialCenter={firstParam(query.pusat)}
            initialDepth={parseLayerParam(firstParam(query.lapis))}
            initialLabelFilter={{ sembunyikan: firstParam(query.sembunyikan), sumber: firstParam(query.sumber) }}
            clusters={styles.map((style) => ({ id: style.cluster.id, name: style.cluster.name, color: style.color }))}
            coordination={map.coordination}
          />

          {/* grid-cols-1 = minmax(0,1fr): cegah tabel lebar mendorong kolom melebihi layar HP. */}
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
            <div className="min-w-0 space-y-5 lg:col-span-2">
              <ClustersPanel chain={map.chain} styles={styles} />
              <MapTable chain={map.chain} symbol={map.token.symbol} nodes={nodes} connections={connections} />
            </div>
            <aside className="min-w-0 space-y-5" aria-label="Legenda dan keterangan">
              <MapLegendPanel />
              <ClassificationLegend />
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
