# OpenChain Intelligence

Workspace investigasi multichain yang mengubah data blockchain mentah menjadi
intelligence on-chain yang dapat ditelusuri, diverifikasi, dan dijelaskan.

> Multichain wallet tracing, token due diligence, fund-flow analysis, risk
> intelligence, and evidence-backed reporting.

## Status

Fase frontend: halaman Token sudah bisa dibuka dengan **data tiruan**. Semua
token, address, dan hash transaksi di dalamnya fiktif. Backend (NestJS +
PostgreSQL) menyusul di fase berikutnya.

## Struktur

```
apps/
  web/            Next.js (App Router, TypeScript, Tailwind CSS)
    src/app/                      Halaman: beranda & /token/[chain]/[address]
    src/components/token/         Panel halaman Token (risiko, holder, aktivitas, bukti)
    src/lib/types.ts              Kontrak data yang nanti diikuti backend
    src/lib/api/tokens.ts         Akses data (sementara membaca mock)
    src/lib/mock/                 Data tiruan
```

## Menjalankan

Butuh Node.js 20.9 atau lebih baru.

```bash
npm install
npm run dev
```

Lalu buka http://localhost:3000 dan pilih salah satu token contoh.

Perintah lain:

```bash
npm run lint       # ESLint
npm run typecheck  # cek tipe TypeScript
npm run build      # build produksi
```
