import { ArrowLeftRight } from "lucide-react";
import { ClassificationBadge } from "@/components/classification-badge";
import { Panel } from "@/components/ui/panel";
import type { ChainId, FlowTransfer } from "@/lib/types";
import { FundFlowList } from "./fund-flow-list";

interface TransfersPanelProps {
  chain: ChainId;
  /** Sudah diurutkan dari yang terbaru. */
  transfers: FlowTransfer[];
}

export function TransfersPanel({ chain, transfers }: TransfersPanelProps) {
  return (
    <Panel
      id="transfer"
      title="Daftar dana masuk & keluar"
      description="Setiap transfer beserta hash transaksi sebagai bukti."
      icon={ArrowLeftRight}
      action={<ClassificationBadge classification="fact" />}
    >
      <FundFlowList chain={chain} transfers={transfers} />
    </Panel>
  );
}
