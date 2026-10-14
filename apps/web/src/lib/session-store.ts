"use client";

/**
 * Penyimpanan sesi tiruan di `localStorage`, dibaca lewat
 * `useSyncExternalStore`. Perubahan dari tab lain ikut terbaca lewat event
 * `storage`. Bila penyimpanan browser diblokir, sesi hanya hidup di memori.
 */
import { useSyncExternalStore } from "react";
import { parseSession, serializeSession, SESSION_STORAGE_KEY, type MockSession } from "./session";

const listeners = new Set<() => void>();
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
  listeners.forEach((listener) => listener());
}

function snapshot(): MockSession | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSession = parseSession(raw);
  }
  return cachedSession;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function startSession(account: { displayName: string; email: string }, at: Date = new Date()): void {
  writeRaw(serializeSession({ displayName: account.displayName, email: account.email, signedInAt: at.toISOString() }));
}

export function endSession(): void {
  writeRaw(null);
}

/** `undefined` selama render server dan hidrasi (status belum diketahui), lalu sesi atau `null`. */
export function useMockSession(): MockSession | null | undefined {
  return useSyncExternalStore(subscribe, snapshot, () => undefined);
}
