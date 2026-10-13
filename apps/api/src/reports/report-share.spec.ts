import { parseShare } from './report-input.js';
import { hashToken, linkStatus, toLinkView, toPublicView } from './report-share.js';
import type { ReportView } from './reports.types.js';

const NOW = new Date('2026-10-04T00:00:00Z');

describe('tautan berbagi laporan', () => {
  it('hash token SHA-256 dan status tautan', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(linkStatus({ expiresAt: null, revokedAt: null }, NOW)).toBe('active');
    expect(linkStatus({ expiresAt: NOW, revokedAt: null }, NOW)).toBe('expired');
    expect(linkStatus({ expiresAt: null, revokedAt: NOW }, NOW)).toBe('revoked');
    expect(toLinkView({ id: 3, tokenPrefix: 'AbC123', createdAt: NOW, expiresAt: null, revokedAt: null, lastViewedAt: null, viewCount: 2 }, NOW)).toEqual({
      id: '3',
      prefix: 'AbC123',
      createdAt: NOW.toISOString(),
      expiresAt: null,
      revokedAt: null,
      lastViewedAt: null,
      viewCount: 2,
      status: 'active',
    });
  });

  it('tampilan publik tanpa tautan kasus dan kunci asal blok', () => {
    const report = {
      source: { caseId: '7', title: 'Kasus NBLA', href: '/kasus/7' },
      sections: [
        {
          id: '1',
          title: 'Temuan',
          blocks: [
            { kind: 'claim', id: '2', claim: { id: '2', title: 'x', detail: '', classification: 'heuristic', provider: 'p', observedAt: null, evidence: [], evidenceTxHashes: [], sourceKey: 'case:a' } },
            { kind: 'entity', id: '3', subject: { kind: 'address', chain: null, address: '0x1', title: 'W', href: '/multichain/0x1' }, sourceKey: 'subject:x' },
          ],
        },
      ],
    } as unknown as ReportView;
    const view = toPublicView(report, { createdAt: NOW, expiresAt: null });
    expect(view.source).toEqual({ title: 'Kasus NBLA' });
    expect(JSON.stringify(view)).not.toContain('case:a');
    expect(JSON.stringify(view)).not.toContain('/kasus/7');
    expect(view.share).toEqual({ createdAt: NOW.toISOString(), expiresAt: null });
  });

  it('masa berlaku 1–365 hari atau tanpa batas', () => {
    expect(parseShare(undefined)).toEqual({ expiresInDays: null });
    expect(parseShare({ expiresInDays: 30 })).toEqual({ expiresInDays: 30 });
    expect(() => parseShare({ expiresInDays: 0 })).toThrow('1–365');
    expect(() => parseShare({ expiresInDays: 1.5 })).toThrow('1–365');
  });
});
