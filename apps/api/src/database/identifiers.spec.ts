import {
  buildEvidenceKey,
  dedupeAddresses,
  InvalidIdentifierError,
  normalizeAddress,
  normalizeTxHash,
} from './identifiers.js';

const CHECKSUMMED = '0x86C8862bA06BEFeEd8bC12d165A430166395D5a3';
const SOLANA = 'UrEtoKYS1FB8G4XfsxRvkp3zUYmdzFnqmFTL2c4RNh3r';

describe('normalizeAddress', () => {
  it('menurunkan huruf address EVM dan membuang spasi', () => {
    expect(normalizeAddress('evm', `  ${CHECKSUMMED} `)).toBe(CHECKSUMMED.toLowerCase());
  });

  it('membiarkan address Solana apa adanya karena case-sensitive', () => {
    expect(normalizeAddress('solana', SOLANA)).toBe(SOLANA);
  });

  it('menolak format yang salah', () => {
    expect(() => normalizeAddress('evm', '0x1234')).toThrow(InvalidIdentifierError);
    expect(() => normalizeAddress('solana', '0OIl-bukan-base58-0000000000000000')).toThrow(
      InvalidIdentifierError,
    );
    expect(() => normalizeAddress('tron', '   ')).toThrow(InvalidIdentifierError);
  });
});

describe('normalizeTxHash', () => {
  it('menurunkan huruf hash EVM', () => {
    const hash = `0x${'AB'.repeat(32)}`;
    expect(normalizeTxHash('evm', hash)).toBe(hash.toLowerCase());
  });

  it('menolak hash EVM yang panjangnya salah', () => {
    expect(() => normalizeTxHash('evm', '0xabc')).toThrow(InvalidIdentifierError);
  });

  it('membiarkan signature Solana apa adanya', () => {
    const signature = '5'.repeat(30) + 'Ab'.repeat(29);
    expect(normalizeTxHash('solana', signature)).toBe(signature);
  });
});

describe('dedupeAddresses', () => {
  it('membuang duplikat secara deterministik tanpa mengubah identifier asli', () => {
    const lower = CHECKSUMMED.toLowerCase();
    const other = '0x' + '1'.repeat(40);
    const result = dedupeAddresses('evm', [CHECKSUMMED, other, lower, ` ${CHECKSUMMED}`, 'bukan-address']);
    expect(result.addresses).toEqual([
      { address: CHECKSUMMED, normalized: lower },
      { address: other, normalized: other },
    ]);
    expect(result.duplicates).toEqual([lower, ` ${CHECKSUMMED}`]);
    expect(result.invalid).toEqual(['bukan-address']);
  });

  it('memberi hasil yang sama untuk input yang sama', () => {
    const input = [CHECKSUMMED, CHECKSUMMED.toLowerCase()];
    expect(dedupeAddresses('evm', input)).toEqual(dedupeAddresses('evm', input));
  });

  it('menangani minimal 15 wallet sesuai target MVP', () => {
    const wallets = Array.from({ length: 15 }, (_, i) => `0x${i.toString(16).padStart(40, '0')}`);
    const withDuplicates = [...wallets, ...wallets.map((w) => w.toUpperCase().replace('0X', '0x'))];
    const result = dedupeAddresses('evm', withDuplicates);
    expect(result.addresses).toHaveLength(15);
    expect(result.duplicates).toHaveLength(15);
  });
});

describe('buildEvidenceKey', () => {
  const base = {
    chainId: 'robinhood',
    classification: 'verified_fact' as const,
    txHash: `0x${'ab'.repeat(32)}`,
    logIndex: 3,
  };

  it('stabil untuk isi yang sama', () => {
    expect(buildEvidenceKey(base)).toBe(buildEvidenceKey({ ...base }));
    expect(buildEvidenceKey(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('berbeda bila salah satu bagian berbeda', () => {
    const keys = new Set([
      buildEvidenceKey(base),
      buildEvidenceKey({ ...base, logIndex: 4 }),
      buildEvidenceKey({ ...base, classification: 'heuristic', heuristicName: 'common_funder' }),
      buildEvidenceKey({ ...base, chainId: 'ethereum' }),
      buildEvidenceKey({ ...base, subject: 'finding:owner_can_change_tax' }),
    ]);
    expect(keys.size).toBe(5);
  });
});
