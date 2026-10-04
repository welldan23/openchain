import type { FlowLabelView } from '../flows/flow-summary.types.js';
import { labelsForSubject, type LabelSubject } from './entity-labels.js';

const EXCHANGE: FlowLabelView = {
  type: 'exchange',
  name: 'Bybit: Hot Wallet',
  source: 'external',
  sourceName: 'Blockscout',
  classification: 'external_label',
  confidence: null,
};

const subject = (extra: Partial<LabelSubject> = {}): LabelSubject => ({
  nodeId: 1,
  addressId: 10,
  address: '0x' + 'ab'.repeat(20),
  role: 'holder',
  sharePct: 0.5,
  isContract: false,
  stored: [],
  ...extra,
});
const none = { deployerAddressId: null, bundledNodeIds: new Set<number>() };
const types = (labels: FlowLabelView[]) => labels.map((label) => `${label.source}:${label.type}`);

describe('label entitas dugaan', () => {
  it('address nol dan dead diberi label burn dengan keyakinan penuh', () => {
    const [label] = labelsForSubject(subject({ address: '0x000000000000000000000000000000000000dEaD', role: 'connector' }), none);
    expect(label).toMatchObject({ type: 'burn', source: 'heuristic', sourceName: 'OpenChain heuristic', classification: 'heuristic', confidence: 1 });
  });

  it('pembuat kontrak token diberi label deployer, setelah label eksternal', () => {
    const labels = labelsForSubject(subject({ stored: [EXCHANGE] }), { ...none, deployerAddressId: 10 });
    expect(types(labels)).toEqual(['external:exchange', 'heuristic:deployer']);
  });

  it('holder di kelompok bundler diberi label bot, bukan whale', () => {
    const labels = labelsForSubject(subject({ sharePct: 5 }), { ...none, bundledNodeIds: new Set([1]) });
    expect(labels).toEqual([expect.objectContaining({ type: 'bot', name: 'Kemungkinan bundler atau sniper', confidence: 0.5 })]);
  });

  it('whale hanya untuk holder biasa dengan porsi besar dan tanpa label lain', () => {
    expect(labelsForSubject(subject({ sharePct: 12.5 }), none)).toEqual([
      expect.objectContaining({ type: 'whale', name: 'Whale (12,5% supply)', confidence: 0.6 }),
    ]);
    expect(labelsForSubject(subject({ sharePct: 0.99 }), none)).toEqual([]);
    expect(labelsForSubject(subject({ sharePct: 12.5, isContract: true }), none)).toEqual([]);
    expect(types(labelsForSubject(subject({ sharePct: 12.5, stored: [EXCHANGE] }), none))).toEqual(['external:exchange']);
    expect(labelsForSubject(subject({ sharePct: 12.5, role: 'funder' }), none)).toEqual([]);
  });

  it('tidak menggandakan jenis yang sudah ada di label tersimpan', () => {
    const stored = { ...EXCHANGE, type: 'deployer', name: 'Deployer', sourceName: 'Blockscout' };
    expect(types(labelsForSubject(subject({ stored: [stored] }), { ...none, deployerAddressId: 10 }))).toEqual(['external:deployer']);
  });
});
