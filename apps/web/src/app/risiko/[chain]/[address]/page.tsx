import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { EvidenceProvider } from "@/components/evidence/evidence-dialog";
import { MockDataNotice } from "@/components/mock-data-notice";
import { ReasonDrawerProvider } from "@/components/risk/reason-drawer";
import {
  RiskDataStatusNotice,
  RiskLabelsPanel,
  RiskLinksPanel,
  RiskObjectHeader,
  RiskReasonsPanel,
  RiskScorePanel,
  RiskSnapshotPanel,
} from "@/components/risk/risk-object";
import { RiskWarningsPanel } from "@/components/risk/risk-warnings-panel";
import { ClassificationLegend } from "@/components/token/classification-legend";
import { getObjectRisk } from "@/lib/api/risk";
import { isChainId } from "@/lib/chains";
import { RISK_LEVEL_META, RISK_OBJECT_KIND_META } from "@/lib/labels";

/** Dipakai bersama oleh generateMetadata & Page; `cache` mencegah fetch ganda. */
const loadRisk = cache(async (chain: string, address: string) => {
  if (!isChainId(chain)) return null;
  return getObjectRisk(chain, decodeURIComponent(address));
});

export async function generateMetadata({ params }: PageProps<"/risiko/[chain]/[address]">): Promise<Metadata> {
  const { chain, address } = await params;
  const risk = await loadRisk(chain, address);
  if (!risk) return { title: "Objek belum dinilai" };
  return {
    title: `Risiko ${risk.title}`,
    description: `${RISK_OBJECT_KIND_META[risk.kind].label} · ${RISK_LEVEL_META[risk.level].label}. Alasan penilaian, peringatan dini, dan sumber label beserta bukti transaksinya.`,
  };
}

export default async function RiskPage({ params }: PageProps<"/risiko/[chain]/[address]">) {
  await connection();
  const { chain, address } = await params;
  const risk = await loadRisk(chain, address);
  if (!risk) notFound();
  const now = new Date();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <RiskObjectHeader risk={risk} now={now} />
      <RiskDataStatusNotice risk={risk} />
      <EvidenceProvider evidence={risk.evidence}>
        <ReasonDrawerProvider risk={risk}>
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
            <div className="min-w-0 space-y-5 lg:col-span-2">
              <RiskScorePanel risk={risk} />
              <RiskReasonsPanel risk={risk} />
              <RiskWarningsPanel risk={risk} now={now} />
            </div>
            <div className="min-w-0 space-y-5">
              <RiskLabelsPanel risk={risk} />
              <RiskLinksPanel risk={risk} />
              <RiskSnapshotPanel risk={risk} />
              <ClassificationLegend />
            </div>
          </div>
        </ReasonDrawerProvider>
      </EvidenceProvider>
    </main>
  );
}
