/**
 * Cek kontrak EVM dari data yang bisa diverifikasi: status verifikasi source
 * code (explorer), owner (`owner()`), dan pola proxy (slot EIP-1967 dan clone
 * EIP-1167). Pajak, blacklist, mint, pause, kunci likuiditas, dan simulasi
 * jual diambil dari penyedia analisis keamanan (GoPlus, honeypot.is).
 *
 * Kode dan label pemeriksaan sama dengan yang dipakai frontend.
 */
import type { ExplorerContractInfo, ProviderRunRecord, TokenSecurityReport } from '../../providers/provider.types.js';
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

/** Hasil satu sumber analisis keamanan beserta run provider-nya. */
export interface SecurityFinding {
  run: ProviderRunRecord;
  report: TokenSecurityReport;
}

const WHY = {
  tax: 'Pajak yang bisa diubah owner dapat dinaikkan sampai token sulit dijual.',
  blacklist: 'Address yang di-blacklist tidak bisa mentransfer atau menjual token.',
  mint: 'Fungsi mint memungkinkan supply baru dicetak dan menekan harga.',
  pause: 'Fungsi pause bisa menghentikan semua transfer token.',
  'liquidity-lock': 'LP yang tidak terkunci bisa ditarik kapan saja oleh pemiliknya.',
  honeypot: 'Simulasi memastikan token benar-benar bisa dijual kembali.',
} as const;

const LABELS = {
  tax: 'Pajak transaksi',
  blacklist: 'Fungsi blacklist',
  mint: 'Fungsi mint',
  pause: 'Pause transfer',
  'liquidity-lock': 'Kunci likuiditas',
  honeypot: 'Simulasi jual',
} as const;

type SecurityCode = keyof typeof LABELS;
type SecurityField = Exclude<keyof TokenSecurityReport, 'sourceName' | 'missingFields'>;

/** Pajak di atas batas ini dianggap berisiko. */
const HIGH_TAX_PCT = 10;
/** LP yang terkunci atau dibakar minimal sebesar ini dianggap aman. */
const SAFE_LOCKED_LP_PCT = 95;
/** LP tanpa kunci di satu wallet biasa: mulai perlu perhatian, dan mulai berisiko. */
const WATCH_WALLET_LP_PCT = 20;
const RISKY_WALLET_LP_PCT = 50;
const FUNCTION_NOTE = 'Fungsi ini ada di kode kontrak; siapa yang masih bisa memanggilnya belum dianalisis.';

/**
 * Sumber pertama yang punya nilai untuk field tertentu. Simulasi honeypot.is
 * didahulukan untuk honeypot dan pajak karena benar-benar menjalankan jual-beli.
 */
function pick(findings: SecurityFinding[], field: SecurityField): SecurityFinding | null {
  const simulationFirst = field === 'honeypot' || field.endsWith('TaxPct');
  const ordered = simulationFirst
    ? [...findings].sort((a, b) => Number(b.run.provider === 'honeypot.is') - Number(a.run.provider === 'honeypot.is'))
    : findings;
  return ordered.find((finding) => finding.report[field] !== null) ?? null;
}

function securityCheck(
  code: SecurityCode,
  status: 'fail' | 'warn' | 'pass',
  value: string,
  note: string | null,
  source: SecurityFinding,
  claim: string,
  context: StateContext,
): CollectedCheck {
  return {
    code,
    label: LABELS[code],
    status,
    value,
    description: [WHY[code], note, `Sumber: ${source.report.sourceName}.`].filter(Boolean).join(' '),
    classification: 'external_label',
    evidence: [
      {
        classification: 'external_label',
        explanation: `${source.report.sourceName}: ${claim}`,
        subject: `${context.token}:${code}@${context.blockNumber}:${source.run.provider}`,
        runKey: source.run.key,
        contractAddress: context.token,
      },
    ],
  };
}

function notAnalyzed(code: SecurityCode, reason: string | null): CollectedCheck {
  const value = code === 'honeypot' ? 'Belum disimulasikan' : 'Belum dianalisis';
  return unknown(code, LABELS[code], value, reason ? `${WHY[code]} ${reason}` : WHY[code]);
}

/**
 * Cek pajak, blacklist, mint, pause, kunci likuiditas, dan simulasi jual dari
 * penyedia analisis keamanan. Hasilnya klaim pihak ketiga, jadi klasifikasinya
 * `external_label`. Tanpa data, cek tetap `unknown` beserta alasannya.
 */
export function securityChecks(findings: SecurityFinding[], unavailableReason: string | null, context: StateContext): CollectedCheck[] {
  const checks: CollectedCheck[] = [];

  const buySource = pick(findings, 'buyTaxPct');
  const sellSource = pick(findings, 'sellTaxPct');
  const taxSource = buySource ?? sellSource;
  if (taxSource) {
    const buy = taxSource.report.buyTaxPct;
    const sell = taxSource.report.sellTaxPct;
    const modifiable = pick(findings, 'taxModifiable')?.report.taxModifiable === true;
    const highest = Math.max(Number(buy ?? 0), Number(sell ?? 0));
    const status = highest >= HIGH_TAX_PCT ? 'fail' : highest > 0 || modifiable ? 'warn' : 'pass';
    const value = `Beli ${buy ?? '?'}% · Jual ${sell ?? '?'}%${modifiable ? ', bisa diubah owner' : ''}`;
    checks.push(securityCheck('tax', status, value, null, taxSource, `pajak beli ${buy ?? 'tidak diketahui'}%, pajak jual ${sell ?? 'tidak diketahui'}%${modifiable ? ', dan pajak bisa diubah' : ''}.`, context));
  } else {
    checks.push(notAnalyzed('tax', unavailableReason));
  }

  const functionCheck = (code: 'blacklist' | 'mint' | 'pause', field: 'blacklist' | 'mintable' | 'pausable', name: string) => {
    const source = pick(findings, field);
    if (!source) return notAnalyzed(code, unavailableReason);
    return source.report[field]
      ? securityCheck(code, 'warn', `Ada fungsi ${name}`, FUNCTION_NOTE, source, `kontrak punya fungsi ${name}.`, context)
      : securityCheck(code, 'pass', `Tidak ada fungsi ${name}`, null, source, `kontrak tidak punya fungsi ${name}.`, context);
  };
  checks.push(functionCheck('blacklist', 'blacklist', 'blacklist'));
  checks.push(functionCheck('mint', 'mintable', 'mint'));
  checks.push(functionCheck('pause', 'pausable', 'pause'));

  const lpSource = pick(findings, 'lpLockedPct');
  if (lpSource) {
    const locked = Number(lpSource.report.lpLockedPct);
    const wallet = Number(lpSource.report.lpTopWalletPct ?? 0);
    if (locked >= SAFE_LOCKED_LP_PCT) {
      const text = `${lpSource.report.lpLockedPct}% LP terkunci atau dibakar`;
      checks.push(securityCheck('liquidity-lock', 'pass', text, null, lpSource, `${text}.`, context));
    } else if (wallet >= WATCH_WALLET_LP_PCT) {
      const text = `Satu wallet memegang ${lpSource.report.lpTopWalletPct}% LP tanpa kunci`;
      checks.push(
        securityCheck(
          'liquidity-lock',
          wallet >= RISKY_WALLET_LP_PCT ? 'fail' : 'warn',
          text,
          'Wallet ini bisa menarik likuiditas sebanyak itu kapan saja.',
          lpSource,
          `${text}; ${lpSource.report.lpLockedPct}% terkunci atau dibakar.`,
          context,
        ),
      );
    } else {
      checks.push(
        notAnalyzed(
          'liquidity-lock',
          `Tidak ada kunci LP yang terdeteksi (${lpSource.report.lpLockedPct}% terkunci atau dibakar), tapi LP tersebar atau dipegang kontrak, jadi risikonya belum bisa dipastikan.`,
        ),
      );
    }
  } else {
    checks.push(notAnalyzed('liquidity-lock', unavailableReason ?? 'Data pemegang LP tidak tersedia.'));
  }

  const honeypotSource = pick(findings, 'honeypot');
  if (honeypotSource) {
    const simulated = honeypotSource.run.provider === 'honeypot.is';
    checks.push(
      honeypotSource.report.honeypot
        ? securityCheck('honeypot', 'fail', 'Terdeteksi honeypot, token tidak bisa dijual', null, honeypotSource, 'token terdeteksi sebagai honeypot.', context)
        : securityCheck(
            'honeypot',
            'pass',
            simulated ? 'Bisa dijual dalam simulasi' : 'Tidak terdeteksi honeypot',
            null,
            honeypotSource,
            simulated ? 'simulasi beli dan jual berhasil.' : 'token tidak terdeteksi sebagai honeypot.',
            context,
          ),
    );
  } else {
    checks.push(notAnalyzed('honeypot', unavailableReason));
  }
  return checks;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
