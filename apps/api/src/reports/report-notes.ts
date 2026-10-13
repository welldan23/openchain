/** Catatan investigasi laporan, murni: daftar catatan dan klaim yang bisa dikaitkan. */
import type { ReportNoteView, ReportSectionView } from './reports.types.js';

export const NOTES_SECTION = 'Catatan investigasi';
export const LIMITS_SECTION = 'Batasan';

/** Bagian catatan dibuat sebelum "Batasan", atau di akhir bila tidak ada. */
export function notesSectionAt(titles: string[]): number {
  const limits = titles.indexOf(LIMITS_SECTION);
  return limits === -1 ? titles.length : limits;
}

export function claimOptions(sections: ReportSectionView[]): Array<{ blockId: string; title: string }> {
  return sections.flatMap((section) => section.blocks.flatMap((block) => (block.kind === 'claim' ? [{ blockId: block.id, title: block.claim.title }] : [])));
}

export function reportNotes(sections: ReportSectionView[]): ReportNoteView[] {
  const claims = new Map(claimOptions(sections).map((option) => [option.blockId, option]));
  return sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.kind === 'note'
        ? [
            {
              id: block.id,
              body: block.body,
              createdAt: block.createdAt,
              editedAt: block.editedAt,
              sectionId: section.id,
              sectionTitle: section.title,
              claim: block.claimBlockId === null ? null : (claims.get(block.claimBlockId) ?? null),
            },
          ]
        : [],
    ),
  );
}
