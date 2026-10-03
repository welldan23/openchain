import { Network } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { tokenPath } from "@/lib/api/tokens";
import type { ChainId } from "@/lib/types";

/** Peta untuk token yang holder-nya belum terindeks. */
export function MapEmptyPanel({ chain, token, symbol }: { chain: ChainId; token: string; symbol: string }) {
  return (
    <Panel id="peta" title="Peta hubungan" description="Gelembung = wallet, garis = transfer di antara wallet." icon={Network}>
      <EmptyState
        icon={Network}
        title="Belum ada wallet untuk dipetakan"
        description={`Holder ${symbol} belum terindeks dari blockchain, jadi belum ada gelembung, kelompok, atau gerak serempak yang bisa ditampilkan. Ini bukan berarti token aman; datanya belum ada.`}
        action={
          <Link
            href={tokenPath(chain, token)}
            className="inline-flex items-center rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
          >
            Buka halaman token
          </Link>
        }
      />
    </Panel>
  );
}
