/**
 * Validasi preferensi tampilan dan pemilihan chain bawaan, murni. Pilihan
 * sama dengan enum database. Bahasa Inggris ditolak karena antarmukanya belum
 * tersedia; chain bawaan hanya boleh chain yang sudah lolos smoke test
 * (`validated`).
 */
import {
  densityPreference,
  languagePreference,
  numberLocale,
  themePreference,
  timeDisplay,
  valueUnit,
  type ChainSupportStatus,
  type DensityPreference,
  type LanguagePreference,
  type NumberLocale,
  type ThemePreference,
  type TimeDisplay,
  type ValueUnit,
} from '../database/schema/enums.js';
import { ProfileInputError } from './profile-input.js';

export interface PreferencesUpdate {
  theme?: ThemePreference;
  language?: LanguagePreference;
  numberLocale?: NumberLocale;
  timeDisplay?: TimeDisplay;
  compactNumbers?: boolean;
  valueUnit?: ValueUnit;
  /** `null` mengosongkan pilihan, jadi aplikasi kembali memakai chain tervalidasi pertama. */
  defaultChain?: string | null;
  density?: DensityPreference;
}

/** Bahasa yang antarmukanya sudah lengkap. */
export const AVAILABLE_LANGUAGES: readonly LanguagePreference[] = ['id'];

const CHOICES = {
  theme: themePreference.enumValues,
  language: languagePreference.enumValues,
  numberLocale: numberLocale.enumValues,
  timeDisplay: timeDisplay.enumValues,
  valueUnit: valueUnit.enumValues,
  density: densityPreference.enumValues,
} as const;

const CHAIN_ID = /^[a-z0-9-]{1,40}$/;

function choice<K extends keyof typeof CHOICES>(key: K, value: unknown): (typeof CHOICES)[K][number] {
  const allowed: readonly string[] = CHOICES[key];
  if (typeof value !== 'string' || !allowed.includes(value)) throw new ProfileInputError(`${key} harus salah satu dari: ${allowed.join(', ')}.`);
  return value as (typeof CHOICES)[K][number];
}

export function parsePreferencesUpdate(value: unknown): PreferencesUpdate {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ProfileInputError('Isi permintaan harus objek JSON.');
  const body = value as Record<string, unknown>;
  const update: PreferencesUpdate = {};
  if (body.theme !== undefined) update.theme = choice('theme', body.theme);
  if (body.language !== undefined) {
    const language = choice('language', body.language);
    if (!AVAILABLE_LANGUAGES.includes(language)) throw new ProfileInputError('Bahasa Inggris belum tersedia; saat ini antarmuka baru lengkap dalam Bahasa Indonesia.');
    update.language = language;
  }
  if (body.numberLocale !== undefined) update.numberLocale = choice('numberLocale', body.numberLocale);
  if (body.timeDisplay !== undefined) update.timeDisplay = choice('timeDisplay', body.timeDisplay);
  if (body.compactNumbers !== undefined) {
    if (typeof body.compactNumbers !== 'boolean') throw new ProfileInputError('compactNumbers harus true atau false.');
    update.compactNumbers = body.compactNumbers;
  }
  if (body.valueUnit !== undefined) update.valueUnit = choice('valueUnit', body.valueUnit);
  if (body.defaultChain !== undefined) {
    if (body.defaultChain !== null && (typeof body.defaultChain !== 'string' || !CHAIN_ID.test(body.defaultChain))) {
      throw new ProfileInputError('defaultChain harus id chain, mis. base, atau null.');
    }
    update.defaultChain = body.defaultChain;
  }
  if (body.density !== undefined) update.density = choice('density', body.density);
  if (Object.keys(update).length === 0) throw new ProfileInputError('Tidak ada yang diubah.');
  return update;
}

export interface ChainChoice {
  id: string;
  name: string;
  supportStatus: ChainSupportStatus;
}

/** `chosen` = pilihan pengguna; `fallback` = chain tervalidasi pertama; `none` = belum ada chain tervalidasi. */
export type DefaultChainSource = 'chosen' | 'fallback' | 'none';

/**
 * Chain bawaan yang dipakai. Pilihan pengguna dipakai selama chain-nya masih
 * `validated`; bila belum dipilih atau statusnya turun, dipakai chain
 * tervalidasi pertama (urutan prioritas adapter). Tidak pernah mengembalikan
 * chain yang belum lolos smoke test.
 */
export function resolveDefaultChain(stored: string | null, chains: readonly ChainChoice[]): { defaultChain: string | null; source: DefaultChainSource; note: string | null } {
  const validated = chains.filter((chain) => chain.supportStatus === 'validated');
  if (stored && validated.some((chain) => chain.id === stored)) return { defaultChain: stored, source: 'chosen', note: null };
  const first = validated[0];
  if (!first) return { defaultChain: null, source: 'none', note: 'Belum ada chain yang lolos smoke test.' };
  const previous = stored ? chains.find((chain) => chain.id === stored) : undefined;
  return {
    defaultChain: first.id,
    source: 'fallback',
    note: previous
      ? `${previous.name} sedang tidak tervalidasi (status ${previous.supportStatus}); sementara memakai ${first.name}.`
      : `Belum memilih chain bawaan; memakai ${first.name}.`,
  };
}

/** Pesan galat bila chain tidak boleh dipilih sebagai bawaan, atau `null` bila boleh. */
export function defaultChainError(chainId: string, chains: readonly ChainChoice[]): string | null {
  const chain = chains.find((item) => item.id === chainId);
  if (!chain) return `Chain ${chainId} tidak dikenal.`;
  if (chain.supportStatus !== 'validated') return `${chain.name} belum didukung penuh (status ${chain.supportStatus}); pilih chain yang sudah lolos smoke test.`;
  return null;
}
