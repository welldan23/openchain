/**
 * Cache respons provider di memori: TTL per entri dan batas jumlah entri
 * (yang paling lama tidak dipakai dibuang dulu). Hanya untuk respons yang
 * berhasil dan aman diulang, supaya batas pemakaian API gratis tidak cepat
 * habis. Kunci bisa memuat URL dengan API key, jadi kunci tidak pernah
 * dicetak atau dikirim ke mana pun.
 */
export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
}

export class ResponseCache {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly maxEntries = 1_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= this.now()) {
      if (entry) this.entries.delete(key);
      this.misses++;
      return undefined;
    }
    // Dipakai lagi: pindah ke belakang supaya tidak dibuang duluan.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits++;
    return structuredClone(entry.value) as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { value: structuredClone(value), expiresAt: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, entries: this.entries.size };
  }
}
