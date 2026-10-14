/**
 * Pengaturan akun tiruan. Provider dan nama environment variable-nya sama
 * dengan yang dibaca backend (`apps/api/src/chains/chain-registry.ts`).
 */
import type { AccountSettings } from "../types";

const CHECKED_AT = "2026-10-03T05:00:00.000Z";

export const MOCK_SETTINGS: AccountSettings = {
  profile: {
    id: "user-1",
    displayName: "Rina Analis",
    email: "rina@contoh.id",
    timezone: "Asia/Jakarta",
    joinedAt: "2026-06-12T03:20:00.000Z",
    avatarUrl: null,
  },
  preferences: {
    theme: "dark",
    language: "id",
    numberLocale: "id",
    timeDisplay: "local",
    defaultChain: "base",
    density: "comfortable",
  },
  dataSources: [
    {
      id: "rpc",
      name: "RPC chain",
      kind: "rpc",
      chains: ["ethereum", "base", "bsc", "arbitrum"],
      status: "degraded",
      statusNote: "RPC publik BNB Chain sering membatasi request; data BSC bisa tertinggal beberapa blok.",
      envVars: [{ name: "RPC_URL_<CHAIN>", purpose: "Ganti RPC publik, mis. dengan RPC berbayar. Beberapa URL dipisah koma untuk fallback.", required: false, configured: false }],
      lastCheckedAt: CHECKED_AT,
    },
    {
      id: "blockscout",
      name: "Blockscout",
      kind: "explorer",
      chains: ["ethereum", "base", "arbitrum"],
      status: "ok",
      statusNote: "Instance publik Blockscout menjawab normal.",
      envVars: [
        { name: "BLOCKSCOUT_API_KEY", purpose: "Pakai Blockscout PRO API untuk chain yang di-host Blockscout.", required: false, configured: false },
        { name: "BLOCKSCOUT_URL_<CHAIN>", purpose: "Ganti instance Blockscout sebuah chain.", required: false, configured: false },
      ],
      lastCheckedAt: CHECKED_AT,
    },
    {
      id: "dexscreener",
      name: "Dexscreener",
      kind: "market",
      chains: ["ethereum", "base", "bsc", "arbitrum", "solana"],
      status: "ok",
      statusNote: "Harga dan likuiditas pair tersedia tanpa API key.",
      envVars: [],
      lastCheckedAt: CHECKED_AT,
    },
    {
      id: "goplus",
      name: "GoPlus Security",
      kind: "security",
      chains: ["ethereum", "base", "bsc", "arbitrum"],
      status: "ok",
      statusNote: "Analisis keamanan kontrak aktif.",
      envVars: [{ name: "SECURITY_PROVIDERS", purpose: "Penyedia analisis keamanan yang dipakai (goplus, honeypotis); none mematikan.", required: false, configured: false }],
      lastCheckedAt: CHECKED_AT,
    },
    {
      id: "honeypotis",
      name: "Honeypot.is",
      kind: "security",
      chains: ["ethereum", "base", "bsc"],
      status: "down",
      statusNote: "Pemeriksaan terakhir gagal (batas waktu habis). Hasil simulasi jual ditandai tidak tersedia, bukan aman.",
      envVars: [{ name: "SECURITY_PROVIDERS", purpose: "Penyedia analisis keamanan yang dipakai (goplus, honeypotis); none mematikan.", required: false, configured: false }],
      lastCheckedAt: CHECKED_AT,
    },
    {
      id: "arkham",
      name: "Arkham (label entitas)",
      kind: "label",
      chains: [],
      status: "not_integrated",
      statusNote: "Belum terhubung. Repo dan API-nya masih menunggu audit lisensi dan keamanan sebelum dipakai.",
      envVars: [],
      lastCheckedAt: null,
    },
  ],
  storage: { cases: 4, reports: 3, history: 18 },
};
