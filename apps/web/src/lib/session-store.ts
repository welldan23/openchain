"use client";

/**
 * Sesi pengguna di browser, dibaca lewat `useSyncExternalStore`.
 *
 * - Mode live: sumber kebenarannya cookie sesi HttpOnly dari backend. Status
 *   dibaca sekali dari `GET /api/auth/session` (hanya nama, email, waktu
 *   dibuat; token tidak pernah terlihat), lalu diperbarui saat masuk, ganti
 *   nama, atau keluar.
 * - Mode tiruan: sesi tiruan di `localStorage`; perubahan dari tab lain ikut
 *   terbaca lewat event `storage`. Bila penyimpanan diblokir, hanya di memori.
 */
import { useSyncExternalStore } from "react";
import { apiJson, apiRaw, ApiError, isLive } from "./api/http";
import { parseSession, serializeSession, SESSION_STORAGE_KEY, type MockSession } from "./session";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/* --------------------------------- live ---------------------------------- */

let live: MockSession | null | undefined;
let loading = false;

async function loadLiveSession(): Promise<void> {
  if (loading || live !== undefined) return;
  loading = true;
  try {
    const { user } = await apiJson<{ user: { displayName: string; email: string; createdAt: string } }>("/auth/session");
    live = { displayName: user.displayName, email: user.email, signedInAt: user.createdAt };
  } catch (error) {
    // 401 berarti belum masuk; galat lain juga diperlakukan belum masuk supaya tombol masuk tetap ada.
    if (!(error instanceof ApiError) || error.status !== 401) console.warn("Status sesi tidak bisa dibaca.", error);
    live = null;
  } finally {
    loading = false;
    notify();
  }
}

/* --------------------------------- tiruan -------------------------------- */

let memory: string | null = null;
let cachedRaw: string | null | undefined;
let cachedSession: MockSession | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return memory;
  }
}

function writeRaw(raw: string | null): void {
  memory = raw;
  try {
    if (raw === null) window.localStorage.removeItem(SESSION_STORAGE_KEY);
    else window.localStorage.setItem(SESSION_STORAGE_KEY, raw);
  } catch {
    // Penyimpanan diblokir (mis. mode privat): cukup di memori.
  }
  notify();
}

/* --------------------------------- umum ---------------------------------- */

function snapshot(): MockSession | null | undefined {
  if (isLive()) return live;
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSession = parseSession(raw);
  }
  return cachedSession;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (isLive()) {
    void loadLiveSession();
    return () => listeners.delete(listener);
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Catat sesi setelah berhasil masuk/daftar (di mode live, cookie-nya sudah dipasang backend). */
export function startSession(account: { displayName: string; email: string }, at: Date = new Date()): void {
  const session = { displayName: account.displayName, email: account.email, signedInAt: at.toISOString() };
  if (isLive()) {
    live = session;
    notify();
    return;
  }
  writeRaw(serializeSession(session));
}

/** Samakan nama di sesi yang sedang berjalan setelah profil diubah; tanpa sesi tidak melakukan apa-apa. */
export function renameSession(displayName: string): void {
  if (isLive()) {
    if (live) {
      live = { ...live, displayName };
      notify();
    }
    return;
  }
  const current = parseSession(readRaw());
  if (current) writeRaw(serializeSession({ ...current, displayName }));
}

/** Keluar. Di mode live, sesi di server dicabut dan cookie dihapus sebelum status lokal dikosongkan. */
export async function endSession(): Promise<void> {
  if (isLive()) {
    try {
      await apiRaw("/auth/sign-out", { method: "POST" });
    } finally {
      live = null;
      notify();
    }
    return;
  }
  writeRaw(null);
}

/** `undefined` selama render server, hidrasi, atau saat status sesi masih dibaca; lalu sesi atau `null`. */
export function useMockSession(): MockSession | null | undefined {
  return useSyncExternalStore(subscribe, snapshot, () => undefined);
}
