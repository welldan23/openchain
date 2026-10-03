# OpenChain Intelligence

Workspace investigasi multichain yang mengubah data blockchain mentah menjadi
intelligence on-chain yang dapat ditelusuri, diverifikasi, dan dijelaskan.

> Multichain wallet tracing, token due diligence, fund-flow analysis, risk
> intelligence, and evidence-backed reporting.

Produk ini read-only: tidak ada private key, signing, wallet connect, swap,
atau pengiriman transaksi.

## Status

- **Frontend fase 1:** halaman Token sudah bisa dibuka dengan **data tiruan**.
  Semua token, address, dan hash transaksi di dalamnya fiktif.
- **Backend fase 1:** skema database, empat endpoint baca data token, dan
  adapter EVM untuk 8 chain (prioritas Robinhood Chain) sudah ada. Data token
  sungguhan diambil lewat `npm run ingest` dari RPC, Blockscout, dan
  Dexscreener, lalu disimpan sebagai snapshot per blok. Frontend belum membaca
  API ini.
- Status dukungan chain hanya naik lewat smoke test (`npm run smoke:chain`).
  Hasilnya ada di `apps/api/README.md`.

## Struktur

```
apps/
  web/            Next.js (App Router, TypeScript, Tailwind CSS)
    src/app/                      Halaman: beranda & /token/[chain]/[address]
    src/components/token/         Panel halaman Token (risiko, holder, aktivitas, bukti)
    src/lib/types.ts              Kontrak data yang nanti diikuti backend
    src/lib/api/tokens.ts         Akses data (sementara membaca mock)
    src/lib/mock/                 Data tiruan
  api/            NestJS + PostgreSQL (Drizzle ORM)
    src/database/schema/          Skema database
    src/tokens/                   Endpoint baca data token
    src/providers/                Provider: RPC, Blockscout, Dexscreener (read-only)
    src/chains/                   Definisi chain dan adapter EVM
    src/ingestion/                Penyimpanan hasil ingest
    src/cli/                      CLI ingest dan smoke test
    drizzle/                      File migrasi
docker-compose.yml                PostgreSQL lokal untuk pengembangan
```

## Menjalankan

Butuh Node.js 22.12 atau lebih baru.

```bash
npm install
npm run dev
```

Lalu buka http://localhost:3000 dan pilih salah satu token contoh.

Data tiruan sengaja diberi jeda sekitar 0,6 detik supaya tampilan loading
terlihat. Beranda juga punya contoh token tanpa data (tampilan kosong) dan
simulasi data gagal dimuat (tampilan error).

Untuk backend, siapkan PostgreSQL lalu jalankan migrasi. Langkah lengkapnya ada
di `apps/api/README.md`.

```bash
docker compose up -d postgres
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run dev:api
```

Ambil data token sungguhan, lalu buka hasilnya lewat API:

```bash
npm run ingest -- ethereum 0x6982508145454Ce325dDbE47a25d4ec3d2311933
curl http://localhost:4000/api/tokens/ethereum/0x6982508145454Ce325dDbE47a25d4ec3d2311933/summary
```

Cek dulu chain mana yang siap dipakai di lingkungan kamu:

```bash
npm run smoke:chain -- all
```

Perintah lain, dijalankan untuk semua aplikasi:

```bash
npm run lint       # lint
npm run typecheck  # cek tipe TypeScript
npm test           # tes unit (Vitest)
npm run build      # build produksi
```
