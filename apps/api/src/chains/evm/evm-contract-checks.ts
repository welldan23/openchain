/**
 * Cek kontrak EVM dari data yang bisa diverifikasi: status verifikasi source
 * code (explorer), owner (`owner()`), dan pola proxy (slot EIP-1967 dan clone
 * EIP-1167). Pemeriksaan yang butuh analisis kode atau simulasi transaksi
 * ditandai `unknown` sampai fitur analisis risiko (fase 3) tersedia.
 *
 * Kode dan label pemeriksaan sama dengan yang dipakai frontend.
 */
import type { ExplorerContractInfo, ProviderRunRecord } from '../../providers/provider.types.js';
import type { CollectedCheck, CollectedEvidence } from '../chain-adapter.types.js';

export type OwnerState =
  | { kind: 'renounced' }
  | { kind: 'active'; owner: string }
  | { kind: 'none' }
  | { kind: 'error'; reason: string };

export type ProxyState =
  | { kind: 'eip1967'; implementation: string }
  | { kind: 'beacon'; beacon: string }
  | { kind: 'eip1167'; implementation: string }
  | { kind: 'none' }
  | { kind: 'error'; reason: string };

/** Blok dan token tempat state dibaca; semua bukti on-chain menunjuk ke sini. */
export interface StateContext {
  token: string;
  blockNumber: number;
  blockTimestamp: Date | null;
  rpcRunKey: string;
}

function stateEvidence(context: StateContext, subject: string, method: string, explanation: string): CollectedEvidence {
  return {
    classification: 'verified_fact',
    explanation,
    subject: `${context.token}:${subject}@${context.blockNumber}`,
    runKey: context.rpcRunKey,
    blockNumber: context.blockNumber,
    blockTimestamp: context.blockTimestamp,
    method,
    contractAddress: context.token,
  };
}

function unknown(code: string, label: string, value: string, description: string | null): CollectedCheck {
  return { code, label, status: 'unknown', value, description, classification: null, evidence: [] };
}

const VERIFIED_LABEL = 'Source code';
const VERIFIED_WHY = 'Kode yang terverifikasi bisa dibaca dan diaudit siapa saja.';

export function verifiedCheck(
  info: ExplorerContractInfo | null,
  explorerRun: ProviderRunRecord,
  context: StateContext,
): CollectedCheck {
  if (!info) return unknown('verified', VERIFIED_LABEL, 'Explorer tidak tersedia', explorerRun.errorReason);
  if (info.verified === null) return unknown('verified', VERIFIED_LABEL, 'Status verifikasi tidak diketahui', null);
  const contract = info.contractName ? ` (nama kontrak ${info.contractName})` : '';
  const evidence: CollectedEvidence = {
    classification: 'external_label',
    explanation: info.verified
      ? `${capitalize(explorerRun.provider)} menyatakan source code kontrak ini terverifikasi${contract}.`
      : `${capitalize(explorerRun.provider)} menyatakan source code kontrak ini belum terverifikasi.`,
    subject: `${context.token}:verified@${context.blockNumber}`,
    runKey: explorerRun.key,
    contractAddress: context.token,
  };
  return info.verified
    ? {
        code: 'verified',
        label: VERIFIED_LABEL,
        status: 'pass',
        value: 'Terverifikasi di explorer',
        description: VERIFIED_WHY,
        classification: 'external_label',
        evidence: [evidence],
      }
    : {
        code: 'verified',
        label: VERIFIED_LABEL,
        status: 'warn',
        value: 'Belum terverifikasi',
        description: 'Source code tidak bisa dibaca publik, jadi isi kontrak tidak bisa diaudit.',
        classification: 'external_label',
        evidence: [evidence],
      };
}

const OWNERSHIP_LABEL = 'Kepemilikan kontrak';

export function ownershipCheck(owner: OwnerState, context: StateContext): CollectedCheck {
  const block = context.blockNumber;
  switch (owner.kind) {
    case 'renounced':
      return {
        code: 'ownership',
        label: OWNERSHIP_LABEL,
        status: 'pass',
        value: 'Owner sudah di-renounce',
        description: 'Tidak ada owner yang bisa memanggil fungsi khusus owner.',
        classification: 'verified_fact',
        evidence: [
          stateEvidence(context, 'owner', 'owner()', `owner() pada blok ${block} mengembalikan address nol, artinya kepemilikan kontrak sudah dilepas.`),
        ],
      };
    case 'active':
      return {
        code: 'ownership',
        label: OWNERSHIP_LABEL,
        status: 'warn',
        value: 'Owner masih aktif, belum di-renounce',
        description: `Owner saat ini ${owner.owner}. Owner aktif masih bisa memanggil fungsi khusus owner kapan saja.`,
        classification: 'verified_fact',
        evidence: [
          stateEvidence(context, 'owner', 'owner()', `owner() pada blok ${block} mengembalikan ${owner.owner}; address ini memegang hak owner.`),
        ],
      };
    case 'none':
      return unknown(
        'ownership',
        OWNERSHIP_LABEL,
        'Tidak ada fungsi owner()',
        'Kontrak tidak memakai pola owner standar; hak akses lain, mis. role, belum dianalisis.',
      );
    case 'error':
      return unknown('ownership', OWNERSHIP_LABEL, 'Gagal dibaca dari RPC', owner.reason);
  }
}

const PROXY_LABEL = 'Kontrak proxy';
const PROXY_WHY = 'Kontrak proxy bisa diganti logikanya setelah deploy.';

export function proxyCheck(proxy: ProxyState, context: StateContext): CollectedCheck {
  const block = context.blockNumber;
  const method = 'eth_getStorageAt (slot EIP-1967)';
  switch (proxy.kind) {
    case 'eip1967':
      return {
        code: 'proxy',
        label: PROXY_LABEL,
        status: 'warn',
        value: 'Proxy upgradeable, logika bisa diganti',
        description: `Implementasi saat ini ${proxy.implementation}. ${PROXY_WHY}`,
        classification: 'verified_fact',
        evidence: [
          stateEvidence(
            context,
            'proxy',
            method,
            `Slot implementasi EIP-1967 pada blok ${block} berisi ${proxy.implementation}; logika token dijalankan dari kontrak itu dan bisa diganti admin proxy.`,
          ),
        ],
      };
    case 'beacon':
      return {
        code: 'proxy',
        label: PROXY_LABEL,
        status: 'warn',
        value: 'Proxy beacon, logika bisa diganti',
        description: `Beacon saat ini ${proxy.beacon}. ${PROXY_WHY}`,
        classification: 'verified_fact',
        evidence: [
          stateEvidence(
            context,
            'proxy',
            method,
            `Slot beacon EIP-1967 pada blok ${block} berisi ${proxy.beacon}; logika token mengikuti beacon itu dan bisa diganti pemilik beacon.`,
          ),
        ],
      };
    case 'eip1167':
      return {
        code: 'proxy',
        label: PROXY_LABEL,
        status: 'pass',
        value: 'Clone EIP-1167, target tetap',
        description: `Semua panggilan diteruskan ke ${proxy.implementation}; target clone tidak bisa diganti.`,
        classification: 'verified_fact',
        evidence: [
          stateEvidence(
            context,
            'proxy',
            'eth_getCode',
            `Bytecode kontrak pada blok ${block} adalah clone EIP-1167 yang meneruskan semua panggilan ke ${proxy.implementation}.`,
          ),
        ],
      };
    case 'none':
      return {
        code: 'proxy',
        label: PROXY_LABEL,
        status: 'pass',
        value: 'Bukan proxy standar',
        description: 'Slot EIP-1967 kosong dan bytecode bukan clone EIP-1167. Pola upgrade non-standar belum dianalisis.',
        classification: 'verified_fact',
        evidence: [
          stateEvidence(
            context,
            'proxy',
            method,
            `Pada blok ${block}, slot implementasi dan beacon EIP-1967 kosong dan bytecode kontrak bukan clone EIP-1167.`,
          ),
        ],
      };
    case 'error':
      return unknown('proxy', PROXY_LABEL, 'Gagal dibaca dari RPC', proxy.reason);
  }
}

/** Pemeriksaan yang butuh analisis kode atau simulasi; menyusul di fase 3. */
const UNANALYZED: ReadonlyArray<{ code: string; label: string; value: string; description: string }> = [
  {
    code: 'tax',
    label: 'Pajak transaksi',
    value: 'Belum dianalisis',
    description: 'Pajak yang bisa diubah owner dapat dinaikkan sampai token sulit dijual.',
  },
  {
    code: 'blacklist',
    label: 'Fungsi blacklist',
    value: 'Belum dianalisis',
    description: 'Address yang di-blacklist tidak bisa mentransfer atau menjual token.',
  },
  {
    code: 'mint',
    label: 'Fungsi mint',
    value: 'Belum dianalisis',
    description: 'Fungsi mint memungkinkan supply baru dicetak dan menekan harga.',
  },
  {
    code: 'pause',
    label: 'Pause transfer',
    value: 'Belum dianalisis',
    description: 'Fungsi pause bisa menghentikan semua transfer token.',
  },
  {
    code: 'liquidity-lock',
    label: 'Kunci likuiditas',
    value: 'Belum dianalisis',
    description: 'LP yang tidak terkunci bisa ditarik kapan saja oleh pemiliknya.',
  },
  {
    code: 'honeypot',
    label: 'Simulasi jual',
    value: 'Belum disimulasikan',
    description: 'Simulasi memastikan token benar-benar bisa dijual kembali.',
  },
];

export function unanalyzedChecks(): CollectedCheck[] {
  return UNANALYZED.map((check) => unknown(check.code, check.label, check.value, check.description));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
