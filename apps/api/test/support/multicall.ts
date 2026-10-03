/**
 * Simulasi Multicall3 untuk tes: membaca calldata `aggregate3` dan menyusun
 * data balikannya, supaya RPC palsu bisa menjawab seperti kontrak aslinya.
 */
const word = (data: string, byteOffset: number) => Number(BigInt(`0x${data.slice(byteOffset * 2, byteOffset * 2 + 64)}`));
const pad = (hex: string) => hex.padStart(64, '0');

/** Daftar panggilan dari calldata `aggregate3((address,bool,bytes)[])`. */
export function decodeAggregate3Calls(calldata: string): Array<{ target: string; allowFailure: boolean; callData: string }> {
  if (!calldata.startsWith('0x82ad56cb')) throw new Error('Bukan calldata aggregate3');
  const data = calldata.slice(10);
  const arrayStart = word(data, 0);
  const length = word(data, arrayStart);
  const base = arrayStart + 32;
  return Array.from({ length }, (_, index) => {
    const tuple = base + word(data, base + index * 32);
    const bytesStart = tuple + word(data, tuple + 64);
    const bytesLength = word(data, bytesStart);
    return {
      target: `0x${data.slice(tuple * 2 + 24, tuple * 2 + 64)}`,
      allowFailure: word(data, tuple + 32) === 1,
      callData: `0x${data.slice((bytesStart + 32) * 2, (bytesStart + 32 + bytesLength) * 2)}`,
    };
  });
}

/** Data balikan `aggregate3`: `(bool success, bytes returnData)[]`. */
export function encodeAggregate3Result(results: Array<{ success: boolean; returnData: string }>): string {
  const tuples = results.map(({ success, returnData }) => {
    const bytes = returnData.slice(2);
    return `${pad(success ? '1' : '0')}${pad('40')}${pad((bytes.length / 2).toString(16))}${bytes.padEnd(Math.ceil(bytes.length / 64) * 64, '0')}`;
  });
  let offset = results.length * 32;
  const offsets = tuples.map((tuple) => {
    const current = pad(offset.toString(16));
    offset += tuple.length / 2;
    return current;
  });
  return `0x${pad('20')}${pad(results.length.toString(16))}${offsets.join('')}${tuples.join('')}`;
}
