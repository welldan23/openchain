/**
 * Kontrak respons `GET /api/chains` dan `GET /api/chains/:chain`: daftar
 * jaringan beserta bukti status dukungannya. Status hanya naik lewat smoke
 * test tersimpan; kemampuan yang belum pernah diuji selalu `planned`.
 */
import type { ChainCapability, ChainFamily, ChainSupportStatus } from '../database/schema/enums.js';

export interface SmokeCheckView {
  code: string;
  provider: string;
  level: 'rpc' | 'data' | 'optional';
  ok: boolean;
  detail: string;
}

export interface SmokeCheckSummary {
  id: number;
  testedAt: string;
  status: ChainSupportStatus;
  passed: number;
  /** Pemeriksaan wajib yang gagal. */
  failed: number;
  /** Pemeriksaan opsional yang gagal; hanya informasi. */
  optionalFailed: number;
}

export interface ChainCapabilityView {
  capability: ChainCapability;
  status: ChainSupportStatus;
  /** Provider yang dipakai; `null` bila belum ada. */
  source: string | null;
  reason: string | null;
  /** Waktu smoke test yang menjadi dasar status ini; `null` bila belum pernah diuji. */
  checkedAt: string | null;
}

export interface ChainCatalogItem {
  id: string;
  name: string;
  family: ChainFamily;
  evmChainId: number | null;
  nativeSymbol: string;
  explorerUrl: string | null;
  supportStatus: ChainSupportStatus;
  /** `true` hanya bila `validated`: boleh disebut didukung. */
  supported: boolean;
  /** Adapter chain ini sudah dibuat (belum berarti lolos smoke test). */
  hasAdapter: boolean;
  /** Smoke test yang menjadi dasar status; `null` bila belum pernah diuji. */
  lastCheck: SmokeCheckSummary | null;
  capabilities: ChainCapabilityView[];
}

export interface ChainCatalogResponse {
  chains: ChainCatalogItem[];
  summary: { total: number; validated: number; experimental: number; planned: number };
  caveats: string[];
}

export interface ChainDetailResponse {
  chain: ChainCatalogItem;
  /** Pemeriksaan smoke test terakhir; kosong bila belum pernah diuji. */
  checks: SmokeCheckView[];
  /** Riwayat smoke test terbaru dulu, paling banyak 10. */
  history: SmokeCheckSummary[];
  caveats: string[];
}
