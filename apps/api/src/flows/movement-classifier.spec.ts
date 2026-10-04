import { classifyMovement, type MovementParty, type PartyLabel } from './movement-classifier.js';

const label = (id: number, type: PartyLabel['type'], overrides: Partial<PartyLabel> = {}): PartyLabel => ({
  id,
  type,
  name: null,
  source: 'external',
  sourceName: 'Blockscout',
  confidence: null,
  ...overrides,
});
const party = (address: string, ...labels: PartyLabel[]): MovementParty => ({ address, labels });
const A = party('0x' + 'aa'.repeat(20));
const B = party('0x' + 'bb'.repeat(20));

describe('klasifikasi jenis perpindahan', () => {
  it('transfer tanpa label adalah fakta', () => {
    expect(classifyMovement(A, B)).toEqual({
      movementType: 'transfer',
      classification: 'verified_fact',
      basis: 'Transfer langsung antar address tanpa label khusus.',
      labelId: null,
      confidence: null,
    });
  });

  it('mint dan burn dari address nol adalah fakta, apa pun labelnya', () => {
    expect(classifyMovement(party('0x' + '00'.repeat(20)), B)).toMatchObject({ movementType: 'mint', classification: 'verified_fact' });
    expect(classifyMovement(A, party('0x000000000000000000000000000000000000dEaD', label(1, 'exchange')))).toMatchObject({
      movementType: 'burn',
      classification: 'verified_fact',
    });
  });

  it('setoran exchange mengikuti sumber labelnya', () => {
    expect(classifyMovement(A, party(B.address, label(5, 'exchange', { name: 'Hot wallet Binance' })))).toEqual({
      movementType: 'exchange_deposit',
      classification: 'external_label',
      basis: 'Penerima berlabel exchange: Hot wallet Binance (Blockscout).',
      labelId: 5,
      confidence: null,
    });
    expect(classifyMovement(A, party(B.address, label(6, 'exchange', { source: 'heuristic', sourceName: 'OpenChain heuristic', confidence: 0.64 })))).toMatchObject({
      classification: 'heuristic',
      confidence: 0.64,
      basis: expect.stringContaining('dugaan OpenChain'),
    });
    expect(classifyMovement(A, party(B.address, label(7, 'exchange', { source: 'user', sourceName: 'Saya' })))).toMatchObject({
      classification: 'assumption',
    });
  });

  it('label eksternal didahulukan daripada dugaan bila keduanya ada', () => {
    const both = party(B.address, label(8, 'exchange', { source: 'heuristic', confidence: 0.9 }), label(9, 'exchange'));
    expect(classifyMovement(A, both)).toMatchObject({ labelId: 9, classification: 'external_label' });
  });

  it('urutan petunjuk: exchange, lalu bridge, lalu DEX; arah menentukan setor/tarik dan keluar/masuk', () => {
    expect(classifyMovement(party(A.address, label(1, 'exchange')), B)).toMatchObject({ movementType: 'exchange_withdrawal' });
    expect(classifyMovement(A, party(B.address, label(2, 'bridge'), label(3, 'router')))).toMatchObject({ movementType: 'bridge_out', labelId: 2 });
    expect(classifyMovement(party(A.address, label(4, 'bridge')), B)).toMatchObject({ movementType: 'bridge_in' });
    expect(classifyMovement(party(A.address, label(5, 'liquidity_pool', { name: 'Uniswap V2: NBLA/WETH' })), B)).toMatchObject({
      movementType: 'dex_interaction',
      basis: 'Melibatkan router atau pool DEX: Uniswap V2: NBLA/WETH (Blockscout).',
    });
  });

  it('label yang tidak relevan tidak mengubah jenis', () => {
    expect(classifyMovement(party(A.address, label(1, 'whale')), party(B.address, label(2, 'bot')))).toMatchObject({ movementType: 'transfer' });
  });
});
