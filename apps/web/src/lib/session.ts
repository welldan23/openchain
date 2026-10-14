/**
 * Sesi tiruan selama fase frontend: hanya nama, email, dan waktu masuk.
 * Tidak ada token, cookie, atau kata sandi. Isi dari penyimpanan browser
 * divalidasi; yang rusak dianggap belum masuk.
 */
export const SESSION_STORAGE_KEY = "openchain.mock-session.v1";

export interface MockSession {
  displayName: string;
  email: string;
  signedInAt: string;
}

export function parseSession(raw: string | null): MockSession | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const { displayName, email, signedInAt } = value as Record<string, unknown>;
    if (typeof displayName !== "string" || displayName.trim() === "") return null;
    if (typeof email !== "string" || !email.includes("@")) return null;
    if (typeof signedInAt !== "string" || Number.isNaN(Date.parse(signedInAt))) return null;
    return { displayName, email, signedInAt };
  } catch {
    return null;
  }
}

/** Hanya kolom yang diizinkan yang ditulis, supaya tidak ada data lain yang ikut tersimpan. */
export function serializeSession(session: MockSession): string {
  return JSON.stringify({ displayName: session.displayName, email: session.email, signedInAt: session.signedInAt });
}

export function sessionLabel(session: MockSession | null): string {
  return session ? `Akun: masuk sebagai ${session.displayName}` : "Akun: belum masuk";
}
