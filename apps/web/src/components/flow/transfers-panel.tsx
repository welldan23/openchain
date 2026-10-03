import { ArrowLeftRight } from "lucide-react";
import { ClassificationBadge } from "@/components/classification-badge";
import { Panel } from "@/components/ui/panel";
import type { ChainId, EntityLabel, FlowTransfer } from "@/lib/types";
import { FundFlowList } from "./fund-flow-list";

interface TransfersPanelProps {
  chain: ChainId;
  owner: { address: string; label?: EntityLabel };
  /** Sudah diurutkan dari yang terbaru. */
  transfers: FlowTransfer[];
  /** Jumlah transfer sebelum filter waktu. */
  totalCount: number;
  /** Tautan halaman yang sama tanpa filter waktu. */
  resetHref: string;
}

export function TransfersPanel({ chain, owner, transfers, totalCount, resetHref }: TransfersPanelProps) {
  return (
    <Panel
      id="transfer"
      title="Daftar dana masuk & keluar"
      description="Setiap transfer beserta hash transaksi sebagai bukti. Klik hash untuk melihat buktinya."
      icon={ArrowLeftRight}
      action={<ClassificationBadge classification="fact" />}
    >
      <FundFlowList
        chain={chain}
        owner={owner}
        transfers={transfers}
        totalCount={totalCount}
        resetHref={resetHref}
      />
    </Panel>
  );
}
