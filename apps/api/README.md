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
| `npm run test:e2e` | Tes endpoint lewat HTTP dengan database PGlite |
| `npm run typecheck` / `npm run lint` | Cek tipe dan lint |

## Endpoint

Semua endpoint memakai prefix `/api` dan bersifat read-only.

### `GET /api/tokens/:chain/:address/summary`

Ringkasan token untuk blok Ringkasan Token: profil token, statistik pasar,
konsentrasi holder, skor risiko, info chain, dan snapshot beserta status tiap
provider.

- `:chain` adalah id chain, mis. `robinhood` atau `ethereum`.
- `:address` tidak peka huruf besar-kecil untuk EVM; identifier asli tetap
  dikembalikan apa adanya.
- `?block=` membuka snapshot pada blok tertentu supaya investigasi bisa
  direproduksi. Tanpa parameter ini dipakai snapshot terbaru.
- `dataStatus` bernilai `stale` bila snapshot lebih tua dari
  `SNAPSHOT_STALE_AFTER_MINUTES` (default 60), dan `unavailable` bila token
  belum punya snapshot. Data yang belum tersedia bernilai `null`, tidak ditebak.
- Supply mentah dikirim sebagai string (`totalSupplyRaw`) supaya presisi uint256
  terjaga, beserta versi desimalnya (`totalSupply`).
- Respons error: `404` untuk chain, token, atau snapshot yang tidak ada, dan
  `400` untuk format address atau nomor blok yang salah.

### `GET /api/tokens/:chain/:address/contract-checks`

Hasil cek kontrak: izin dan fungsi yang bisa merugikan holder, misalnya pajak
yang bisa diubah owner atau mint authority yang masih aktif.

- Urutan pemeriksaan: berisiko (`fail`), perlu perhatian (`warn`), belum dicek
  (`unknown`), lalu lolos (`pass`). `summary` berisi jumlah per status.
- Tiap pemeriksaan membawa klasifikasi dan daftar bukti: hash, blok, waktu,
  address terkait, method, penjelasan, dan `explorerUrl` bila chain punya
  explorer.
- Pemeriksaan yang belum dijalankan berstatus `unknown` tanpa klasifikasi.
- Parameter `?block=`, status data, dan respons error sama dengan endpoint
  ringkasan.

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
