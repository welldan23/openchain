import { decodeAggregate3Calls, encodeAggregate3Result } from '../../../test/support/multicall.js';
import {
  AbiDecodeError,
  decodeAddress,
  decodeAggregate3,
  decodeSlotAddress,
  decodeString,
  decodeUint256,
  encodeAggregate3,
  encodeBalanceOf,
  minimalProxyTarget,
} from './abi.js';

const pad = (hex: string) => hex.padStart(64, '0');

/** Encode string ABI dinamis: offset, panjang, lalu isi rata kiri. */
function abiString(value: string): string {
  const bytes = Buffer.from(value, 'utf8').toString('hex');
  const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64 || 64, '0');
  return `0x${pad('20')}${pad(Buffer.from(value, 'utf8').length.toString(16))}${padded}`;
}

describe('ABI ERC-20', () => {
  it('membaca string dinamis', () => {
    expect(decodeString(abiString('Pepe'))).toBe('Pepe');
    expect(decodeString(abiString('Nama token yang panjangnya lebih dari tiga puluh dua byte'))).toBe(
      'Nama token yang panjangnya lebih dari tiga puluh dua byte',
    );
    expect(decodeString(abiString('Robinhood 🏹'))).toBe('Robinhood 🏹');
  });

  it('membaca bytes32 dari token lama dan membuang padding', () => {
    expect(decodeString(`0x${'4d4b52'.padEnd(64, '0')}`)).toBe('MKR');
    expect(decodeString(`0x${'0'.repeat(64)}`)).toBe('');
  });

  it('menolak string yang rusak', () => {
    expect(() => decodeString('0x')).toThrow(AbiDecodeError);
    expect(() => decodeString(`0x${pad('20')}${pad('ff')}${pad('41')}`)).toThrow('Panjang string melebihi data');
    expect(() => decodeString(`0x${pad('20')}${pad('2')}${'c328'.padEnd(64, '0')}`)).toThrow('UTF-8');
  });

  it('membaca uint256 tanpa kehilangan presisi', () => {
    const supply = 420689899645071695787564425681079n;
    expect(decodeUint256(`0x${pad(supply.toString(16))}`)).toBe(supply);
    expect(() => decodeUint256('0x12')).toThrow('terlalu pendek');
  });

  it('membaca address dan menolak word yang bukan address', () => {
    const owner = 'fbfeaf0da0f2fde5c66df570133ae35f3eb58c9a';
    expect(decodeAddress(`0x${pad(owner)}`)).toBe(`0x${owner}`);
    expect(() => decodeAddress(`0x${'1'.repeat(64)}`)).toThrow('bukan address');
  });

  it('membaca address di slot storage, kosong berarti null', () => {
    expect(decodeSlotAddress(`0x${'0'.repeat(64)}`)).toBeNull();
    expect(decodeSlotAddress('0x0')).toBeNull();
    expect(decodeSlotAddress(`0x${pad('abcdef0000000000000000000000000000000001')}`)).toBe(
      '0xabcdef0000000000000000000000000000000001',
    );
  });

  it('menyusun calldata balanceOf', () => {
    expect(encodeBalanceOf('0xF977814e90dA44bFA03b6295A0616a897441aceC')).toBe(
      `0x70a08231${pad('f977814e90da44bfa03b6295a0616a897441acec')}`,
    );
    expect(() => encodeBalanceOf('0x123')).toThrow(AbiDecodeError);
  });

  it('mengenali clone EIP-1167', () => {
    const target = 'bebebebebebebebebebebebebebebebebebebebe';
    expect(minimalProxyTarget(`0x363d3d373d3d3d363d73${target}5af43d82803e903d91602b57fd5bf3`)).toBe(`0x${target}`);
    expect(minimalProxyTarget('0x6080604052')).toBeNull();
  });

  it('menyusun calldata aggregate3 Multicall3 dengan allowFailure', () => {
    const token = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';
    const calls = [
      { target: token, callData: encodeBalanceOf('0xF977814e90dA44bFA03b6295A0616a897441aceC') },
      { target: token, callData: '0x18160ddd' },
    ];
    const calldata = encodeAggregate3(calls);
    expect(calldata.startsWith('0x82ad56cb')).toBe(true);
    expect(decodeAggregate3Calls(calldata)).toEqual(
      calls.map((call) => ({ target: token.toLowerCase(), allowFailure: true, callData: call.callData })),
    );
  });

  it('membaca hasil aggregate3, termasuk panggilan yang gagal', () => {
    const results = [
      { success: true, returnData: `0x${pad('2a')}` },
      { success: false, returnData: '0x' },
      { success: true, returnData: `0x${'ab'.repeat(40)}` },
    ];
    expect(decodeAggregate3(encodeAggregate3Result(results))).toEqual(results);
    expect(decodeAggregate3(encodeAggregate3Result([]))).toEqual([]);
  });

  it('menolak hasil aggregate3 yang terpotong', () => {
    const encoded = encodeAggregate3Result([{ success: true, returnData: `0x${pad('2a')}` }]);
    expect(() => decodeAggregate3(encoded.slice(0, -64))).toThrow(AbiDecodeError);
  });
});
