import { Table2 } from "lucide-react";
import { EntityLabelBadge } from "@/components/badges";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { explorerAddressUrl } from "@/lib/chains";
import { formatPct } from "@/lib/format";
import type { ChainId } from "@/lib/types";
import type { ExplorerNode } from "./wallet-map-explorer";

/** Isi peta dalam bentuk tabel, untuk yang lebih nyaman membaca daftar. */
export function MapTable({ chain, symbol, nodes, connections }: {
  chain: ChainId;
  symbol: string;
  nodes: ExplorerNode[];
  /** Jumlah hubungan per address. */
  connections: Record<string, number>;
}) {
  const rows = [...nodes].sort((a, b) => b.node.sharePct - a.node.sharePct);
  return (
    <Panel id="tabel-peta" title="Wallet di peta" description="Isi peta yang sama dalam bentuk tabel." icon={Table2}>
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Daftar wallet di peta hubungan holder {symbol}</caption>
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pl-4 pr-2 font-medium sm:pl-5">Wallet</th>
              <th scope="col" className="px-2 py-2 font-medium">Klaster</th>
              <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Hubungan</th>
              <th scope="col" className="whitespace-nowrap py-2 pl-2 pr-4 text-right font-medium sm:pr-5">% supply</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((item) => (
              <tr key={item.node.address}>
                <td className="py-2.5 pl-4 pr-2 sm:pl-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <HashLink value={item.node.address} href={explorerAddressUrl(chain, item.node.address)} copyLabel="Salin address" />
                    {item.node.label ? <EntityLabelBadge label={item.node.label} /> : null}
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-foreground/80">
                    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.clusterName ?? <span className="text-muted">Tanpa klaster</span>}
                  </span>
                </td>
                <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">
                  {connections[item.node.address] ?? 0}
                </td>
                <td className="py-2.5 pl-2 pr-4 text-right tabular-nums sm:pr-5">
                  {item.node.sharePct > 0 ? formatPct(item.node.sharePct) : <span className="text-muted">bukan holder</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
