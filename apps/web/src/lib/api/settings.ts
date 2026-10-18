/**
 * Pengaturan akun.
 *
 * Mode live memakai `/api/account` (profil, foto, preferensi, sumber data)
 * lewat `./live/settings`. Mode tiruan membaca data tiruan; perubahannya tidak
 * tersimpan setelah halaman dimuat ulang.
 */
import { MOCK_SETTINGS } from "../mock/settings";
import { validateAvatarFile, validateDisplayName, type AvatarChange } from "../profile";
import type { AccountSettings, DataSourceSetting, DisplayPreferences, UserProfile } from "../types";
import { isLive } from "./http";
import * as live from "./live/settings";

const MOCK_LATENCY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getAccountSettings(): Promise<AccountSettings> {
  if (isLive()) return live.getAccountSettings();
  await delay(MOCK_LATENCY_MS);
  return structuredClone(MOCK_SETTINGS);
}

/**
 * Ubah nama dan foto profil. Mode tiruan: foto hanya dibaca di browser (URL
 * objek lokal), tidak diunggah, dan perubahan hilang saat dimuat ulang.
 */
export async function updateProfile(profile: UserProfile, input: { displayName: string; avatar: AvatarChange }): Promise<UserProfile> {
  const nameError = validateDisplayName(input.displayName);
  if (nameError) throw new Error(nameError);
  if (input.avatar.kind === "replace") {
    const fileError = validateAvatarFile(input.avatar.file);
    if (fileError) throw new Error(fileError);
  }
  if (isLive()) return live.updateProfile(input);
  await delay(MOCK_LATENCY_MS);
  const avatarUrl = input.avatar.kind === "keep" ? profile.avatarUrl : input.avatar.kind === "remove" ? null : URL.createObjectURL(input.avatar.file);
  return { ...profile, displayName: input.displayName.trim(), avatarUrl };
}

/** Simpan preferensi tampilan (mode tiruan: tidak tersimpan setelah halaman dimuat ulang). */
export async function updateDisplayPreferences(current: DisplayPreferences, changes: Partial<DisplayPreferences>): Promise<DisplayPreferences> {
  if (isLive()) return live.updateDisplayPreferences(changes);
  await delay(MOCK_LATENCY_MS);
  return { ...current, ...changes };
}

/** Id sumber yang mensimulasikan penyimpanan gagal, untuk mencoba tampilan galat. */
export const MOCK_FAILING_SOURCE_ID = "simulasi-gagal";

/**
 * Simulasi nyalakan/matikan sumber data untuk akun ini. Sumber terkunci
 * ditolak. Status "Dimatikan" dipakai saat mati; saat dinyalakan lagi,
 * kondisinya kembali ke hasil pemeriksaan terakhir.
 */
export async function setDataSourceEnabled(source: DataSourceSetting, enabled: boolean, previousStatus: DataSourceSetting["status"]): Promise<DataSourceSetting> {
  if (source.lockedReason) throw new Error(`${source.name} tidak bisa diubah. ${source.lockedReason}`);
  if (isLive()) return live.setDataSourceEnabled(source.id, enabled);
  await delay(MOCK_LATENCY_MS);
  if (source.id === MOCK_FAILING_SOURCE_ID && !enabled) throw new Error(`Simulasi: pengaturan ${source.name} gagal disimpan. Coba lagi.`);
  return { ...source, enabled, status: enabled ? previousStatus : "disabled" };
}
