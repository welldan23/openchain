import { countChecks, sortChecks, toContractChecksResponse } from './contract-checks.mapper.js';
import type { ContractCheckRow } from './rows.js';
import { explorerTxUrl } from './evidence.view.js';

const NOW = new Date('2026-10-03T05:00:00Z');

function check(id: number, status: ContractCheckRow['status']): ContractCheckRow {
  return {
    id,
    snapshotId: 1,
    code: `c${id}`,
    label: `Cek ${id}`,
    status,
    value: '-',
    description: null,
    classification: status === 'unknown' ? null : 'verified_fact',
  };
}

const chain = {
  id: 'ethereum',
  family: 'evm' as const,
  evmChainId: 1,
  name: 'Ethereum',
  nativeSymbol: 'ETH',
  explorerUrl: 'https://etherscan.io/',
  supportStatus: 'planned' as const,
  createdAt: NOW,
};

describe('sortChecks dan countChecks', () => {
  const checks = [check(1, 'pass'), check(2, 'warn'), check(3, 'fail'), check(4, 'unknown'), check(5, 'warn')];

  it('menaruh yang bermasalah dulu dan menjaga urutan simpan', () => {
    expect(sortChecks(checks).map((c) => c.id)).toEqual([3, 2, 5, 4, 1]);
  });

  it('merekap jumlah per status tanpa status kosong', () => {
    expect(countChecks(checks)).toEqual([
      { status: 'fail', count: 1 },
      { status: 'warn', count: 2 },
      { status: 'unknown', count: 1 },
      { status: 'pass', count: 1 },
    ]);
    expect(countChecks([check(1, 'pass')])).toEqual([{ status: 'pass', count: 1 }]);
  });
});

describe('explorerTxUrl', () => {
  it('membentuk URL transaksi dan membuang garis miring berlebih', () => {
    expect(explorerTxUrl(chain, '0xabc')).toBe('https://etherscan.io/tx/0xabc');
  });

  it('kosong bila chain belum punya explorer atau bukti tanpa hash', () => {
    expect(explorerTxUrl({ ...chain, explorerUrl: null }, '0xabc')).toBeNull();
    expect(explorerTxUrl(chain, null)).toBeNull();
  });
});

describe('toContractChecksResponse', () => {
  it('melaporkan unavailable tanpa pemeriksaan bila belum ada snapshot', () => {
    const response = toContractChecksResponse(
      {
        chain,
        token: {
          id: 1,
          chainId: 'ethereum',
          addressId: 1,
          standard: 'erc20',
          name: null,
          symbol: null,
          decimals: null,
          totalSupplyRaw: null,
          deployerAddressId: null,
          deployTxHash: null,
          deployedAt: null,
          sourceVerified: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
        address: '0xAbC',
        deployer: null,
        snapshot: null,
        checks: [],
        evidenceByCheck: new Map(),
      },
      NOW,
      60,
    );
    expect(response).toMatchObject({
      token: { standard: 'erc20', standardLabel: 'ERC-20' },
      snapshot: null,
      dataStatus: 'unavailable',
      summary: [],
      checks: [],
    });
  });
});
