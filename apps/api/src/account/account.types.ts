/** Kontrak `/api/account`: profil, preferensi tampilan, dan sumber data pengguna yang sedang masuk. */
import type { DensityPreference, LanguagePreference, NumberLocale, ThemePreference, TimeDisplay, ValueUnit } from '../database/schema/enums.js';
import type { DataSourceView } from './data-source-view.js';
import type { DefaultChainSource } from './preferences-input.js';

export interface ProfileView {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  joinedAt: string;
  /** Alamat foto profil (berubah tiap foto diganti), atau `null` bila memakai inisial. */
  avatarUrl: string | null;
  avatar: { contentType: string; size: number; updatedAt: string } | null;
}

/** Sama dengan `DisplayPreferences` di frontend, ditambah asal chain bawaan. */
export interface PreferencesView {
  theme: ThemePreference;
  language: LanguagePreference;
  numberLocale: NumberLocale;
  timeDisplay: TimeDisplay;
  compactNumbers: boolean;
  valueUnit: ValueUnit;
  /** Chain bawaan yang dipakai; selalu chain tervalidasi, atau `null` bila belum ada. */
  defaultChain: string | null;
  defaultChainSource: DefaultChainSource;
  /** Penjelasan bila chain bawaan bukan pilihan pengguna. */
  defaultChainNote: string | null;
  density: DensityPreference;
  updatedAt: string;
}

export type { DataSourceView } from './data-source-view.js';

export interface DataSourcesResponse {
  /** Rentang waktu `provider_runs` yang dipakai menghitung kondisi. */
  window: { from: string; to: string; hours: number };
  sources: DataSourceView[];
  caveats: string[];
}
