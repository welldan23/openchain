/** Id anchor di halaman Token, supaya bukti dan temuan bisa saling ditautkan. */

export function findingAnchorId(findingId: string): string {
  return `temuan-${findingId}`;
}

export function evidenceAnchorId(txHash: string): string {
  return `bukti-${txHash.slice(0, 18)}`;
}
