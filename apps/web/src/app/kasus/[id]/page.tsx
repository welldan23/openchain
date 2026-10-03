import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import {
  CaseDataStatusNotice,
  CaseFindingsAndEvidence,
  CaseHeader,
  CaseNotesPanel,
  CaseSnapshotPanel,
  CaseStepsPanel,
  CaseSubjectsPanel,
} from "@/components/case/case-detail";
import { MockDataNotice } from "@/components/mock-data-notice";
import { getCase } from "@/lib/api/cases";

/** Dipakai bersama oleh generateMetadata & Page; `cache` mencegah fetch ganda. */
const loadCase = cache(async (id: string) => getCase(decodeURIComponent(id)));

export async function generateMetadata({ params }: PageProps<"/kasus/[id]">): Promise<Metadata> {
  const { id } = await params;
  const item = await loadCase(id);
  if (!item) return { title: "Kasus tidak ditemukan" };
  return { title: item.title, description: item.summary };
}

export default async function CasePage({ params }: PageProps<"/kasus/[id]">) {
  await connection();
  const { id } = await params;
  const item = await loadCase(id);
  if (!item) notFound();
  const now = new Date();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <MockDataNotice />
      <CaseHeader item={item} now={now} />
      <CaseDataStatusNotice item={item} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <CaseFindingsAndEvidence item={item} />
        </div>
        <div className="min-w-0 space-y-5">
          <CaseSubjectsPanel item={item} />
          <CaseSnapshotPanel item={item} />
          <CaseStepsPanel item={item} now={now} />
          <CaseNotesPanel item={item} />
        </div>
      </div>
    </main>
  );
}
