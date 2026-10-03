# api

Backend OpenChain Intelligence: NestJS 12, PostgreSQL, dan Drizzle ORM.
Produk ini **read-only**: tidak ada private key, signing, wallet connect,
swap, atau pengiriman transaksi.

## Menyiapkan database

1. Jalankan PostgreSQL lokal dari root repo:

   ```bash
   docker compose up -d postgres
   ```

2. Salin konfigurasi lalu jalankan migrasi:

   ```bash
   cp apps/api/.env.example apps/api/.env
   npm run db:migrate
   ```

Migrasi aman dijalankan berulang. API key dan URL database hanya dibaca dari
environment variable dan tidak pernah dicetak ke log.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run start:dev` | Menjalankan API di port 4000 |
| `npm run db:generate` | Membuat file migrasi baru dari perubahan skema |
| `npm run db:migrate` | Menerapkan migrasi ke database di `DATABASE_URL` |
| `npm test` | Tes unit, termasuk tes skema di PostgreSQL WebAssembly (PGlite) |
| `npm run typecheck` / `npm run lint` | Cek tipe dan lint |

## Skema data token

Skema ada di `src/database/schema`, migrasinya di `drizzle/`.

| Kelompok | Tabel |
| --- | --- |
| Referensi | `chains`, `addresses`, `labels`, `provider_runs` |
| Data token | `tokens`, `token_snapshots`, `token_snapshot_sources`, `holders` |
| Aktivitas | `transactions`, `token_transfers`, `trading_events` |
| Bukti dan analisis | `evidence`, `risk_findings`, `contract_checks`, serta tabel penghubung ke bukti |

Aturan PRD yang dijaga langsung oleh database:

- Address disimpan dengan identifier aslinya; duplikat dicegah lewat bentuk
  ternormalisasi per chain (EVM huruf kecil, Solana apa adanya).
- Provider yang gagal wajib menyimpan alasan; status data selalu salah satu dari
  `complete`, `partial`, `unavailable`, `stale`.
- Bukti `verified_fact` wajib punya hash transaksi atau nomor blok, bukti
  `heuristic` wajib punya nama heuristic dan confidence, dan label eksternal
  wajib menyebut provider-nya.
- Snapshot disimpan per token per blok supaya investigasi bisa direproduksi,
  dan bukti punya `evidence_key` deterministik supaya penyimpanan idempotent.
- Semua chain dimulai dengan status `planned`. Chain baru boleh disebut
  didukung (`validated`) setelah adapter dan smoke test-nya lulus.

Tabel `internal_transfers`, `funding_edges`, `clusters`, `cluster_members`, dan
`investigations` menyusul di task fitur yang memakainya.
