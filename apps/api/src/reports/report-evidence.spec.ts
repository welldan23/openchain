import { embedCaption, filterEvidenceEntries, reportEvidenceEntries } from './report-evidence.js';
import { parseEmbed } from './report-input.js';
import type { ReportView } from './reports.types.js';

const A = '0x' + 'aa'.repeat(32);
const B = '0x' + 'bb'.repeat(32);
const C = '0x' + 'cc'.repeat(32);
const claim = (id: string, title: string, hashes: string[]) => ({
  kind: 'claim' as const,
  id,
  claim: { id, title, detail: '', classification: 'verified_fact' as const, provider: 'x', observedAt: null, evidence: hashes.map((txHash) => ({ chain: 'base', txHash })), evidenceTxHashes: hashes, sourceKey: null },
});
const report: Pick<ReportView, 'sections' | 'evidence' | 'snapshot'> = {
  sections: [
    { id: '1', title: 'Temuan', blocks: [claim('10', 'Pendana', [A, B]), claim('11', 'Pembeli', [B])] },
    { id: '2', title: 'Bukti utama', blocks: [{ kind: 'evidence', id: '20', chain: 'base', txHash: C, caption: '' }] },
  ],
  evidence: [
    { chain: 'base', txHash: A, stored: false, timestamp: null, blockNumber: null, movements: [], explorerUrl: `https://basescan.org/tx/${A}` },
    {
      chain: 'base',
      txHash: B,
      stored: true,
      timestamp: '2026-10-02T00:00:00.000Z',
      blockNumber: 900,
      movements: [{ from: '0xf1', to: '0xc1', asset: { type: 'native', symbol: 'ETH', name: 'Ether', decimals: 18 } as never, amountRaw: '1', amount: '0.000000000000000001', amountUsd: null }],
      explorerUrl: `https://basescan.org/tx/${B}`,
    },
    { chain: 'base', txHash: C, stored: true, timestamp: '2026-10-01T00:00:00.000Z', blockNumber: 800, movements: [], explorerUrl: `https://basescan.org/tx/${C}` },
  ],
  snapshot: { fetchedAt: '2026-10-03T00:00:00.000Z', blocks: [{ chain: 'base', blockNumber: 1_000 }], sources: ['blockscout'], dataStatus: 'complete', statusReason: null },
};
const chains = new Map([['base', { id: 'base', family: 'evm' as const, explorerUrl: 'https://basescan.org/' }]]);

describe('bukti laporan', () => {
  it('semua hash dengan pengutip, status semat, tangkapan data, dan tautan explorer pihaknya; urut waktu, tanpa rincian di akhir', () => {
    const entries = reportEvidenceEntries(report, chains);
    expect(entries.map((item) => [item.txHash, item.stored, item.embeddedBlockId])).toEqual([
      [C, true, '20'],
      [B, true, null],
      [A, false, null],
    ]);
    const b = entries[1];
    expect(b.citedBy).toEqual([
      { blockId: '10', title: 'Pendana' },
      { blockId: '11', title: 'Pembeli' },
    ]);
    expect(b.detail?.movements[0]).toMatchObject({ fromUrl: 'https://basescan.org/address/0xf1', toUrl: 'https://basescan.org/address/0xc1' });
    expect(b.capture).toEqual({ fetchedAt: '2026-10-03T00:00:00.000Z', blockNumber: 1_000, sources: ['blockscout'] });
    // Belum tersimpan: rincian kosong, tautan explorer tetap ada.
    expect(entries[2]).toMatchObject({ detail: null, explorerUrl: `https://basescan.org/tx/${A}` });
    expect(filterEvidenceEntries(entries, 'not_embedded').map((item) => item.txHash)).toEqual([B, A]);
    expect(filterEvidenceEntries(entries, 'no_detail').map((item) => item.txHash)).toEqual([A]);
  });

  it('keterangan bawaan dan isi permintaan semat', () => {
    expect(embedCaption({ citedBy: [{ blockId: '1', title: 'Pendana' }, { blockId: '2', title: 'Pembeli' }] })).toBe('Bukti untuk: Pendana; Pembeli.');
    expect(embedCaption(undefined)).toBe('Bukti transaksi.');
    expect(parseEmbed({ chain: 'base', txHash: ` ${A} ` })).toEqual({ chain: 'base', txHash: A, caption: null });
    expect(() => parseEmbed({ txHash: A })).toThrow('Chain bukti wajib diisi');
    expect(() => parseEmbed({ chain: 'base' })).toThrow('Hash bukti wajib diisi');
  });
});
