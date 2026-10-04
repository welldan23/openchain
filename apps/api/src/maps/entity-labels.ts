/**
 * Label entitas dugaan untuk wallet di Peta Hubungan Wallet.
 *
 * Label eksternal (mis. tag Blockscout) tetap jadi sumber utama. Di atasnya,
 * peta menambah label `heuristic` yang diturunkan dari data peta itu sendiri,
 * selalu dengan nama sumber, tingkat keyakinan, dan nama yang menjelaskan
 * dasarnya:
 * - `burn`: address nol atau dead;
 * - `deployer`: address pembuat kontrak token;
 * - `bot`: holder di kelompok yang pertama kali menerima token di blok yang
 *   sama (pola bundler/sniper);
 * - `whale`: holder biasa dengan porsi supply besar tanpa label lain.
 * Label ini bergantung pada token dan peta, jadi tidak disimpan sebagai label
 * global address.
 */
import type { MapNodeRole } from '../database/schema/enums.js';
import type { FlowLabelView } from '../flows/flow-summary.types.js';

export const HEURISTIC_LABEL_SOURCE = 'OpenChain heuristic';
/** Porsi supply minimal holder untuk disebut whale. */
export const WHALE_MIN_SHARE_PCT = 1;

const BURN_ADDRESSES = new Set(['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead']);
const SOURCE_ORDER: Record<FlowLabelView['source'], number> = { external: 0, heuristic: 1, user: 2 };

export interface LabelSubject {
  nodeId: number;
  addressId: number;
  address: string;
  role: MapNodeRole;
  sharePct: number;
  isContract: boolean | null;
  /** Label tersimpan (eksternal, heuristic, atau user). */
  stored: FlowLabelView[];
}

export interface LabelContext {
  deployerAddressId: number | null;
  /** Node anggota kelompok berlabel `bundled_or_sniper_activity`. */
  bundledNodeIds: ReadonlySet<number>;
}

function heuristic(type: string, name: string, confidence: number): FlowLabelView {
  return { type, name, source: 'heuristic', sourceName: HEURISTIC_LABEL_SOURCE, classification: 'heuristic', confidence };
}

/** Label tersimpan ditambah label dugaan peta; eksternal dulu, lalu keyakinan tertinggi. */
export function labelsForSubject(subject: LabelSubject, context: LabelContext): FlowLabelView[] {
  const derived: FlowLabelView[] = [];
  const has = (type: string) => subject.stored.some((label) => label.type === type);
  if (BURN_ADDRESSES.has(subject.address.toLowerCase()) && !has('burn')) {
    derived.push(heuristic('burn', 'Address pembakaran (nol/dead)', 1));
  }
  if (context.deployerAddressId === subject.addressId && !has('deployer')) {
    derived.push(heuristic('deployer', 'Pembuat kontrak token', 0.9));
  }
  if (subject.role === 'holder' && context.bundledNodeIds.has(subject.nodeId) && !has('bot')) {
    derived.push(heuristic('bot', 'Kemungkinan bundler atau sniper', 0.5));
  }
  if (
    subject.role === 'holder' &&
    subject.sharePct >= WHALE_MIN_SHARE_PCT &&
    subject.isContract !== true &&
    subject.stored.length === 0 &&
    derived.length === 0
  ) {
    derived.push(heuristic('whale', `Whale (${subject.sharePct.toLocaleString('id-ID', { maximumFractionDigits: 2 })}% supply)`, 0.6));
  }
  return [...subject.stored, ...derived].sort(
    (a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || (b.confidence ?? -1) - (a.confidence ?? -1),
  );
}
