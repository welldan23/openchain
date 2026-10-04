/**
 * Status ketersediaan data per provider dan per chain, dari catatan
 * `provider_runs` dalam rentang waktu terakhir:
 * - `available`: percobaan terakhir berhasil dan kurang dari separuh gagal;
 * - `degraded`: masih ada yang berhasil, tapi yang terakhir gagal atau
 *   setidaknya separuhnya gagal;
 * - `unavailable`: ada percobaan, tapi tidak satu pun berhasil;
 * - `unknown`: belum ada percobaan dalam rentang itu (bukan berarti mati).
 */
export type AvailabilityStatus = 'available' | 'degraded' | 'unavailable' | 'unknown';

export interface ProviderRunStats {
  provider: string;
  kind: string;
  runs: number;
  failures: number;
  lastStatusFailed: boolean;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureReason: string | null;
}

export interface ProviderAvailability {
  provider: string;
  kind: string;
  status: AvailabilityStatus;
  runs: number;
  failures: number;
  /** Persen percobaan yang gagal. */
  failureRatePct: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  /** Alasan kegagalan terakhir; aman ditampilkan (tanpa URL atau API key). */
  lastFailureReason: string | null;
}

export function providerStatus(stats: ProviderRunStats): AvailabilityStatus {
  if (stats.runs === 0) return 'unknown';
  if (stats.lastSuccessAt === null) return 'unavailable';
  if (!stats.lastStatusFailed && stats.failures * 2 < stats.runs) return 'available';
  return 'degraded';
}

export function toProviderAvailability(stats: ProviderRunStats): ProviderAvailability {
  return {
    provider: stats.provider,
    kind: stats.kind,
    status: providerStatus(stats),
    runs: stats.runs,
    failures: stats.failures,
    failureRatePct: stats.runs === 0 ? 0 : Math.round((stats.failures / stats.runs) * 10_000) / 100,
    lastSuccessAt: stats.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: stats.lastFailureAt?.toISOString() ?? null,
    lastFailureReason: stats.lastFailureReason,
  };
}

/** Status chain dari status provider-providernya. */
export function chainStatus(providers: readonly ProviderAvailability[]): AvailabilityStatus {
  const known = providers.filter((item) => item.status !== 'unknown');
  if (known.length === 0) return 'unknown';
  if (known.every((item) => item.status === 'available')) return 'available';
  if (known.every((item) => item.status === 'unavailable')) return 'unavailable';
  return 'degraded';
}
