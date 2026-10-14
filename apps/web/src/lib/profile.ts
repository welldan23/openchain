/** Aturan ubah profil, murni: nama tampilan dan berkas foto. */
import { NAME_MAX, NAME_MIN } from "./auth";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export function validateDisplayName(value: string): string | null {
  const name = value.trim();
  if (name === "") return "Nama wajib diisi.";
  if (name.length < NAME_MIN || name.length > NAME_MAX) return `Nama ${NAME_MIN}–${NAME_MAX} karakter.`;
  return null;
}

export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) return "Foto harus berformat PNG, JPG, atau WebP.";
  if (file.size === 0) return "Berkas foto kosong.";
  if (file.size > AVATAR_MAX_BYTES) return `Ukuran foto maksimal 2 MB (berkas ini ${(file.size / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB).`;
  return null;
}

/** Perubahan foto: tetap, hapus, atau ganti dengan berkas baru. */
export type AvatarChange = { kind: "keep" } | { kind: "remove" } | { kind: "replace"; file: File };
