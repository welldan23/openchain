/**
 * Menentukan jenis tiap perpindahan dana dan klasifikasi informasinya.
 *
 * Mint dan burn dikenali dari address nol (aturan protokol), jadi fakta.
 * Jenis lain (setoran exchange, bridge, DEX) bergantung pada label pihaknya,
 * sehingga klasifikasinya mengikuti sumber label: label eksternal tetap label
 * eksternal, dugaan internal tetap dugaan, dan label dari user hanya asumsi.
 * Tanpa petunjuk apa pun, perpindahan adalah transfer biasa (fakta).
 */
import type { EntityLabelType, InfoClassification, MovementType } from '../database/schema/enums.js';

export interface PartyLabel {
  id: number;
  type: EntityLabelType;
  name: string | null;
  source: 'external' | 'heuristic' | 'user';
  sourceName: string;
  /** 0–1, untuk label heuristic. */
  confidence: number | null;
}

export interface MovementParty {
  address: string;
  labels: readonly PartyLabel[];
}

export interface MovementVerdict {
  movementType: MovementType;
  classification: InfoClassification;
  basis: string;
  labelId: number | null;
  confidence: number | null;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
/** Address "mati" yang lazim dipakai untuk membakar token. */
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dead';

const SOURCE_RANK: Record<PartyLabel['source'], number> = { external: 0, heuristic: 1, user: 2 };
const CLASSIFICATION_OF: Record<PartyLabel['source'], InfoClassification> = {
  external: 'external_label',
  heuristic: 'heuristic',
  user: 'assumption',
};

/** Label terkuat dari jenis tertentu: eksternal dulu, lalu dugaan paling yakin. */
function strongest(party: MovementParty, types: readonly EntityLabelType[]): PartyLabel | null {
  const matching = party.labels.filter((label) => types.includes(label.type));
  matching.sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || (b.confidence ?? 0) - (a.confidence ?? 0) || a.id - b.id);
  return matching[0] ?? null;
}

function describe(label: PartyLabel): string {
  const what = label.name ? `${label.name}` : `label ${label.type.replace('_', ' ')}`;
  const source = label.source === 'external' ? label.sourceName : label.source === 'heuristic' ? 'dugaan OpenChain' : 'label dari pengguna';
  return `${what} (${source})`;
}

function fromLabel(movementType: MovementType, label: PartyLabel, basis: string): MovementVerdict {
  return {
    movementType,
    classification: CLASSIFICATION_OF[label.source],
    basis: `${basis}: ${describe(label)}.`,
    labelId: label.id,
    confidence: label.source === 'heuristic' ? label.confidence : null,
  };
}

function fact(movementType: MovementType, basis: string): MovementVerdict {
  return { movementType, classification: 'verified_fact', basis, labelId: null, confidence: null };
}

export function classifyMovement(from: MovementParty, to: MovementParty): MovementVerdict {
  const fromAddress = from.address.toLowerCase();
  const toAddress = to.address.toLowerCase();
  if (fromAddress === ZERO_ADDRESS) return fact('mint', 'Dikirim dari address nol: token baru dicetak.');
  if (toAddress === ZERO_ADDRESS || toAddress === DEAD_ADDRESS) {
    return fact('burn', 'Dikirim ke address nol/mati: token dibakar dan tidak bisa dipakai lagi.');
  }

  const toExchange = strongest(to, ['exchange']);
  if (toExchange) return fromLabel('exchange_deposit', toExchange, 'Penerima berlabel exchange');
  const fromExchange = strongest(from, ['exchange']);
  if (fromExchange) return fromLabel('exchange_withdrawal', fromExchange, 'Pengirim berlabel exchange');
  const toBridge = strongest(to, ['bridge']);
  if (toBridge) return fromLabel('bridge_out', toBridge, 'Penerima berlabel bridge');
  const fromBridge = strongest(from, ['bridge']);
  if (fromBridge) return fromLabel('bridge_in', fromBridge, 'Pengirim berlabel bridge');
  const dex = strongest(to, ['router', 'liquidity_pool']) ?? strongest(from, ['router', 'liquidity_pool']);
  if (dex) return fromLabel('dex_interaction', dex, 'Melibatkan router atau pool DEX');

  return fact('transfer', 'Transfer langsung antar address tanpa label khusus.');
}
