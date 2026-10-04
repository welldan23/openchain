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
| `npm run ingest -- <chain> <address>` | Ambil data satu token dari chain lalu simpan sebagai snapshot |
| `npm run smoke:chain -- <chain\|all>` | Smoke test adapter chain; `--record` menyimpan status dukungannya |
| `npm run flows:collect -- <address> [chain ...]` | Kumpulkan aliran dana satu address (semua chain bila tidak disebut); `--halaman=N`, `--tanpa-simpan`, `--json` |
| `npm test` | Tes unit, termasuk tes skema di PostgreSQL WebAssembly (PGlite) |
| `npm run test:e2e` | Tes endpoint lewat HTTP dengan database PGlite |
| `npm run typecheck` / `npm run lint` | Cek tipe dan lint |

Tes tidak memakai jaringan: RPC, Blockscout, dan Dexscreener diganti versi
palsu. Uji ke jaringan sungguhan dilakukan lewat `ingest`, `smoke:chain`, dan
`flows:collect`.

## Mengambil data on-chain

### Ingest token

```bash
npm run ingest -- robinhood 0x008Df4b3E857D06c4603Aeb11F267ccD32ce2005
npm run ingest -- ethereum 0x6982508145454Ce325dDbE47a25d4ec3d2311933 --json
```

Satu kali ingest berjalan seperti ini:

1. Explorer, indexer holder, dan data pasar diambil paralel.
2. Blok dipatok 3 blok di belakang blok terbaru. Node RPC di balik load
   balancer yang sedikit tertinggal tetap punya blok itu, dan reorg dangkal
   tidak mengubah snapshot.
3. State on-chain dibaca lewat RPC pada blok itu: nama, simbol, decimals, total
   supply, `owner()`, slot proxy EIP-1967, dan bytecode.
4. Saldo 50 holder teratas dari indexer dibaca ulang lewat `balanceOf` pada blok
   yang sama, digabung dalam satu panggilan Multicall3. Bila satu saldo saja
   gagal, daftar holder tidak disimpan supaya peringkat dan konsentrasi tidak
   menyesatkan.
5. Tx pembuatan dari explorer diverifikasi lewat receipt RPC sebelum dipakai
   sebagai data deployer.
6. Analisis keamanan diambil dari GoPlus Security dan simulasi jual honeypot.is,
   paralel dengan langkah 1.
7. Semuanya disimpan lewat `SnapshotRecorder`: run provider, address, profil
   token, label eksternal, bukti, cek kontrak, dan snapshot.

Aturan yang dijaga:

- Setiap pengambilan provider dicatat di `provider_runs`, termasuk yang gagal,
  beserta alasan, waktu, rentang blok, dan field yang hilang. Data yang gagal
  diambil dibiarkan kosong, tidak ditebak.
- Snapshot tetap dibuat walau explorer atau data pasar gagal; statusnya
  `partial`. Snapshot tidak dibuat bila RPC gagal, chain ID RPC salah, address
  bukan kontrak, atau token bukan ERC-20.
- Ingest ulang aman: address, label, dan bukti tidak digandakan, identifier asli
  tidak berubah, dan nilai yang kali ini gagal diambil tidak menimpa nilai lama.
- Cek kontrak dari data on-chain: owner (`owner()`) dan proxy (slot EIP-1967
  dan clone EIP-1167), sebagai `verified_fact`.
- Cek kontrak dari pihak ketiga, sebagai `external_label` lengkap dengan
  sumbernya: source code terverifikasi (explorer), pajak, blacklist, mint,
  pause, kunci likuiditas, dan simulasi jual (GoPlus, honeypot.is). Untuk pajak
  dan honeypot, simulasi honeypot.is didahulukan.
- Aturan penilaian cek keamanan:

  | Cek | Lolos | Perlu perhatian | Berisiko |
  | --- | --- | --- | --- |
  | Pajak | 0% dan tidak bisa diubah | di atas 0%, atau bisa diubah owner | 10% atau lebih |
  | Blacklist, mint, pause | fungsinya tidak ada | fungsinya ada di kode | — |
  | Kunci likuiditas | 95% LP atau lebih terkunci/dibakar | satu wallet memegang 20% LP atau lebih tanpa kunci | satu wallet memegang 50% LP atau lebih tanpa kunci |
  | Simulasi jual | bisa dijual | — | honeypot |

  LP yang tersebar atau dipegang kontrak tanpa kunci terdeteksi tetap
  `unknown`, karena risikonya belum bisa dipastikan. Fungsi blacklist, mint,
  dan pause dinilai dari keberadaannya di kode; siapa yang masih bisa
  memanggilnya belum dianalisis.
- Skor risiko masih `unknown` sampai fitur Skor Risiko (fase 3).
- Bukti state pada blok snapshot tertaut ke halaman blok di explorer, karena
  bukti itu tidak punya hash transaksi.

Belum ada endpoint HTTP untuk memicu ingest, karena endpoint publik tanpa
autentikasi bisa disalahgunakan untuk membanjiri provider. Ingest dijalankan
lewat CLI atau job internal.

### Smoke test chain

```bash
npm run smoke:chain -- robinhood
npm run smoke:chain -- all --record
```

Smoke test memakai token contoh tiap chain dan memeriksa:

- **RPC:** chain ID, umur blok terbaru, transaksi dan receipt, `eth_getLogs`, dan
  `eth_call`. `debug_traceTransaction` dicek sebagai informasi saja.
- **Explorer dan indexer:** info kontrak dan daftar holder.
- **Data pasar:** pool DEX untuk token contoh, sekaligus memastikan id chain
  Dexscreener benar.

| Status | Arti |
| --- | --- |
| `validated` | Semua provider lolos; chain boleh disebut didukung |
| `experimental` | RPC lolos, tapi explorer, indexer, atau data pasar belum; data token akan parsial |
| `planned` | RPC belum lolos; chain belum bisa dipakai |

`--record` menyimpan status ke `chains.support_status`. Status tidak pernah
dinaikkan lewat migrasi, hanya lewat smoke test di lingkungan yang dipakai.

### Environment variable provider

Semuanya opsional dan tidak pernah dicetak. Daftar lengkapnya ada di
`.env.example`.

| Variabel | Fungsi |
| --- | --- |
| `RPC_URL_<CHAIN>` | Ganti RPC sebuah chain, mis. `RPC_URL_BSC`, dengan RPC berbayar ber-API key. Beberapa URL dipisah koma, urut prioritas |
| `BLOCKSCOUT_API_KEY` | Pakai Blockscout PRO API (API key gratis di dev.blockscout.com) untuk chain yang di-host Blockscout. Dikirim lewat header, bukan URL |
| `BLOCKSCOUT_URL_<CHAIN>` | Ganti instance Blockscout sebuah chain |
| `PROVIDER_TIMEOUT_MS` | Batas waktu tiap request provider (default 15000) |
| `SECURITY_PROVIDERS` | Penyedia analisis keamanan, dipisah koma: `goplus`, `honeypotis`. Default keduanya; `none` mematikan |

Request yang gagal karena batas rate (HTTP 429), error server (5xx), timeout,
atau gangguan koneksi dicoba ulang sampai 3 kali dengan jeda yang makin panjang.

Setiap chain bisa memakai beberapa endpoint RPC. Bila endpoint pertama gagal
atau menolak sebuah method, panggilan pindah ke endpoint berikutnya. Jawaban
kosong untuk blok, transaksi, dan receipt juga dicoba ke endpoint berikutnya,
karena node yang riwayatnya dipangkas menjawab kosong walau datanya ada. Revert
kontrak tidak memicu perpindahan karena itu jawaban sah dari chain. Chain ID
ditanyakan ke semua endpoint dan wajib sama, supaya URL yang salah chain
langsung ketahuan. Default saat ini:

| Chain | RPC utama | Cadangan |
| --- | --- | --- |
| Robinhood Chain | rpc.mainnet.chain.robinhood.com (resmi) | publicnode |
| Ethereum | publicnode | 0xrpc (menyimpan semua receipt), dRPC |
| Base | mainnet.base.org (resmi) | publicnode |
| BNB Chain | bsc-dataseed.bnbchain.org (resmi) | publicnode |
| Arbitrum One | arb1.arbitrum.io (resmi) | publicnode |
| OP Mainnet | mainnet.optimism.io (resmi) | publicnode |
| Polygon PoS | publicnode | dRPC |
| HyperEVM | rpc.hyperliquid.xyz (resmi) | belum ada |

Di jaringan yang wajib lewat proxy HTTP, jalankan Node dengan
`NODE_USE_ENV_PROXY=1` supaya `fetch` memakai `HTTPS_PROXY`.

## Mengumpulkan aliran dana

`FundFlowCollector` (`src/flows`) membaca riwayat transfer satu address dari
indexer (Blockscout) di satu atau beberapa chain, lalu `FundFlowIngestionService`
menyimpannya ke `native_transfers`, `token_transfers`, dan `address_flow_scans`.

- Tiga jenis transfer dibaca terpisah: nilai transaksi, panggilan internal
  kontrak, dan transfer token ERC-20. Satu jenis gagal tidak menghapus jenis
  lain; NFT tidak dihitung sebagai aliran dana.
- Transaksi pending, gagal, atau tanpa nilai dilewati (jumlahnya dilaporkan),
  tapi bloknya tetap menandai sampai mana riwayat sudah terbaca.
- Riwayat dibaca dari yang terbaru, paling banyak `--halaman` halaman per jenis
  (default 5, ±50 item per halaman). Bila riwayat belum habis, cakupan hanya
  dari blok setelah item tertua yang terbaca sampai blok terbaru, karena
  halaman bisa terpotong di tengah blok. Transfer di luar cakupan tidak boleh
  dianggap tidak ada.
- Status `complete` hanya bila ketiga jenis terbaca dan blok terbaru chain
  diketahui. Chain tanpa indexer (mis. BSC, HyperEVM) tercatat `unavailable`
  dengan alasannya. Address salah format ditolak sebelum ada request.
- Pengumpulan ulang tidak menggandakan transfer, tapi tetap mencatat
  pemindaian baru. Nilai USD saat transaksi belum diisi (belum ada sumber harga
  historis), jadi kolomnya kosong, bukan nol.

## Adapter chain

Semua sumber data diakses lewat abstraksi provider di `src/providers`:
RPCProvider, ExplorerProvider, IndexedDataProvider, MarketDataProvider,
EntityLabelProvider, dan SecurityProvider. EntityLabelProvider dan
SecurityProvider baru berupa interface. Label eksternal saat ini ikut dari data
holder Blockscout, dan analisis keamanan menyusul di fase 3.

Adapter EVM (`src/chains/evm`) dipakai semua chain EVM. Perbedaan per chain ada
di `src/chains/chain-definitions.ts`: RPC, explorer, indexer, id Dexscreener,
token standard (ERC-20), model blok, model event (log), format address, dan
token contoh untuk smoke test.

Hasil smoke test dari lingkungan pengembangan pada 3 Oktober 2026:

| Chain | RPC | Explorer dan indexer | Data pasar | Status |
| --- | --- | --- | --- | --- |
| Robinhood Chain (4663) | lolos | ditolak proteksi bot Cloudflare (HTTP 403) | lolos | `experimental` |
| Ethereum (1) | lolos | lolos | lolos | `validated` |
| Base (8453) | lolos | lolos | lolos | `validated` |
| BNB Chain (56) | lolos | belum ada | lolos | `experimental` |
| Arbitrum One (42161) | lolos | lolos | lolos | `validated` |
| OP Mainnet (10) | lolos | lolos | lolos | `validated` |
| Polygon PoS (137) | lolos | lolos | lolos | `validated` |
| HyperEVM (999) | lolos | belum ada | lolos | `experimental` |

Status bisa berbeda di lingkungan lain, jadi jalankan ulang smoke test di
server yang dipakai. Beberapa catatan:

- **Robinhood Chain:** explorer resminya Blockscout
  (`robinhoodchain.blockscout.com`), tapi instance publiknya menolak request
  dari server dengan proteksi bot. Isi `BLOCKSCOUT_API_KEY` supaya data holder
  dan verifikasi kontrak lewat PRO API. Tanpa itu, snapshot Robinhood berstatus
  `partial`.
- **BNB Chain:** tidak ada RPC publik gratis yang melayani semua method
  sendirian. RPC resmi menolak `eth_getLogs`, dan publicnode menolak receipt
  tanpa token, jadi keduanya digabung lewat fallback. Dari 16 RPC publik BSC
  yang diuji (chainlist dan daftar komunitas), sisanya mati, sudah berbayar,
  atau langsung kena batas rate. Blockscout tidak meng-host BNB Chain, jadi
  explorer menyusul.
- **HyperEVM:** explorer Blockscout-nya sedang dialihkan, jadi explorer dan
  indexer menyusul.
- **Node non-archive:** sering tidak menyimpan indeks transaksi lama. Di
  Ethereum ini ditutup oleh 0xrpc; di chain lain data deployer token yang sudah
  lama bisa kosong, dan alasannya tercatat.

## Audit sumber data

Tidak ada kode dari repository referensi yang disalin. Yang dipakai hanya API
publik berikut, sesuai syarat audit di PRD.

| Sumber | Dipakai untuk | Lisensi dan syarat | Kematangan | Keamanan | Chain |
| --- | --- | --- | --- | --- | --- |
| RPC publik (JSON-RPC) | State on-chain pada blok snapshot | Layanan gratis dengan batas rate; bisa diganti lewat `RPC_URL_<CHAIN>` | Standar JSON-RPC Ethereum | Hanya method baca di daftar izin; URL tidak pernah dicetak | 8 chain EVM; BNB Chain belum lengkap |
| Blockscout REST API v2 | Verifikasi kontrak, pembuat, jumlah dan daftar holder, label | Perangkat lunak GPL-3.0; kita hanya memanggil API. PRO API gratis 5 request/detik, 100 ribu kredit/hari | Explorer open-source, explorer resmi Robinhood Chain | API key lewat header, bukan URL | Robinhood (butuh API key dari server), Ethereum, Base, Arbitrum, OP, Polygon |
| Dexscreener API | Harga, perubahan 24 jam, market cap, FDV, likuiditas, volume, jumlah transaksi | Boleh dipakai komersial; dilarang untuk produk yang bersaing langsung dengan Dexscreener atau menjual ulang API-nya. Batas 300 request/menit | API publik populer | Tanpa API key | 8 chain EVM, id chain sudah dicek |
| GoPlus Security API | Pajak, blacklist, mint, pause, honeypot, pemegang LP | Gratis tanpa API key. **Wajib mencantumkan "Powered by GoPlus"** di aplikasi. Data GoPlus tidak boleh langsung dipakai untuk kegiatan komersial yang menghasilkan uang tanpa izin tertulis GoPlus. Batas rate tidak boleh diakali | Dipakai luas oleh wallet dan explorer | Tanpa API key | Robinhood, Ethereum, Base, BNB Chain, Arbitrum, OP, Polygon |
| honeypot.is API | Simulasi beli dan jual, pajak sungguhan | Gratis, saat ini tanpa API key. Dilarang menjual ulang API atau membukanya ke pihak ketiga, dan dilarang untuk produk yang bersaing langsung | Dipakai luas komunitas trader | Tanpa API key | Ethereum, BNB Chain, Base |
| Multicall3 (`0xcA11…CA11`) | Membaca saldo banyak holder dalam satu `eth_call` | Kontrak publik berlisensi MIT | Dipakai luas di ekosistem EVM | Hanya lewat `eth_call`; SHA-256 bytecode dicek dulu sebelum dipakai | 8 chain EVM, bytecode identik |

### Sumber gratis yang dimanfaatkan

Semua sumber di bawah gratis dan sudah diuji ke jaringan sungguhan.

| Sumber | Dipakai untuk | Catatan |
| --- | --- | --- |
| RPC resmi tiap chain, publicnode, dRPC, 0xrpc | State on-chain, receipt, log | Digabung lewat fallback; 0xrpc menyimpan semua receipt Ethereum |
| Blockscout | Verifikasi kontrak, holder, label | Robinhood butuh API key gratis dari server |
| Dexscreener | Harga, likuiditas, volume | API resmi saja |
| GoPlus Security | Pajak, fungsi berbahaya, honeypot, LP | Wajib "Powered by GoPlus"; komersial perlu izin |
| honeypot.is | Simulasi jual | Ethereum, BNB Chain, Base |
| Multicall3 | Saldo holder dalam satu panggilan | Kode diverifikasi SHA-256 |

Belum dipakai, tapi gratis dan sudah dicek:

- **Dexscreener `/orders/v1/{chain}/{token}`:** riwayat profil berbayar dan
  boost token. Berguna sebagai sinyal promosi berbayar. Butuh tempat simpan
  baru di snapshot.
- **Dexscreener `info` di data pair:** gambar, banner, dan link sosial resmi
  token untuk tampilan halaman token.
- **GoPlus:** owner tersembunyi, bisa ambil alih ownership, selfdestruct, dan
  address pembuat token. Bisa dipakai untuk cek tambahan di fitur Risiko.

Endpoint internal situs Dexscreener (`io.dexscreener.com`) **tidak** dipakai.
Endpoint itu tidak termasuk API resmi, dilindungi Cloudflare, dan formatnya bisa
berubah kapan saja.

Kandidat untuk fitur label dan klaster holder (fase 3), dicek Oktober 2026 tapi
**belum dipasang**:

| Sumber | Yang gratis | Kenapa belum dipasang |
| --- | --- | --- |
| InsightX API | Paket Free: 5 request/menit, 1.000 request/bulan. Isinya label address (maks. 100 per request), ringkasan konsentrasi holder, dan klaster | Butuh API key gratis dari `hub.insightx.network` (header `X-API-Key`). Halaman syarat pakai tidak ditemukan. Spesifikasi resmi hanya mencantumkan `eth`, `base`, `bsc` (plus `sol`, `monad`, `xlayer`, `abs`), padahal tabel jaringannya menyebut Robinhood. Tag label bebas tanpa daftar baku, dan format respons klaster tidak didokumentasikan. Sniper, bundler, dan insider hanya untuk Solana |
| BubbleMaps iframe | Peta holder bisa disematkan dengan `partnerId=demo`, tapi hanya di `localhost` | Untuk production butuh partner ID dari BubbleMaps. Cocok untuk mencoba tampilan frontend saat development |
| BubbleMaps Data API | Tidak ada | Berbayar (kredit paket Pro) |

Endpoint internal situs BubbleMaps (`api.bubblemaps.io`) juga **tidak** dipakai,
dengan alasan yang sama seperti Dexscreener. InsightX baru layak dipasang
setelah ada API key untuk diuji ke respons asli, dan syarat pakainya jelas.

Label dari Blockscout bersifat eksternal (`external_label`) dan probabilistik,
bukan bukti kepemilikan. Yang dipetakan hanya tag kategori yang jelas, mis.
exchange, liquidity pool, bridge, dan burn. Tag lain dibiarkan.

## Keamanan read-only

- RPC hanya boleh memanggil method baca: `eth_chainId`, `eth_blockNumber`,
  `eth_getBlockByNumber`, `eth_getTransactionByHash`,
  `eth_getTransactionReceipt`, `eth_getLogs`, `eth_call`, `eth_getCode`,
  `eth_getStorageAt`, dan `debug_traceTransaction`. Method lain seperti
  `eth_sendRawTransaction` atau `eth_sign` ditolak sebelum ada request jaringan.
- Tidak ada private key, signing, wallet connect, atau library wallet.
- Pesan error yang disimpan tidak memuat URL, header, atau API key. Deretan
  karakter panjang yang mirip API key disensor.

## Endpoint

Semua endpoint memakai prefix `/api` dan bersifat read-only.

Semua endpoint token memakai pemilih snapshot yang sama, supaya investigasi
bisa dibuka ulang dengan hasil yang sama:

| Parameter | Snapshot yang dipakai |
| --- | --- |
| tanpa parameter | snapshot terbaru |
| `?block=<nomor>` | snapshot pada blok/slot tersebut |
| `?at=<waktu ISO>` | snapshot terakhir yang diambil sampai waktu itu, mis. `2026-10-03T04:30:00Z` |

`block` dan `at` tidak boleh dipakai bersamaan. Waktu wajib lengkap dengan zona
waktu supaya tidak ambigu.

### `GET /api/tokens/:chain/:address/summary`

Ringkasan token untuk blok Ringkasan Token: profil token, statistik pasar,
konsentrasi holder, skor risiko, info chain, dan snapshot beserta status tiap
provider.

- `:chain` adalah id chain, mis. `robinhood` atau `ethereum`.
- `:address` tidak peka huruf besar-kecil untuk EVM; identifier asli tetap
  dikembalikan apa adanya.
- `dataStatus` bernilai `stale` bila snapshot lebih tua dari
  `SNAPSHOT_STALE_AFTER_MINUTES` (default 60), dan `unavailable` bila token
  belum punya snapshot. Data yang belum tersedia bernilai `null`, tidak ditebak.
- Supply mentah dikirim sebagai string (`totalSupplyRaw`) supaya presisi uint256
  terjaga, beserta versi desimalnya (`totalSupply`). Supply diambil dari
  snapshot yang dipilih, jadi snapshot lama tetap menampilkan supply pada
  bloknya.
- Respons error: `404` untuk chain, token, atau snapshot yang tidak ada, dan
  `400` untuk format address, nomor blok, atau waktu yang salah.

### `GET /api/tokens/:chain/:address/contract-checks`

Hasil cek kontrak: izin dan fungsi yang bisa merugikan holder, misalnya pajak
yang bisa diubah owner atau mint authority yang masih aktif.

- Urutan pemeriksaan: berisiko (`fail`), perlu perhatian (`warn`), belum dicek
  (`unknown`), lalu lolos (`pass`). `summary` berisi jumlah per status.
- Tiap pemeriksaan membawa klasifikasi dan daftar bukti: hash, blok, waktu,
  address terkait, method, penjelasan, dan `explorerUrl` bila chain punya
  explorer. `explorerUrl` menunjuk halaman transaksi, atau halaman blok untuk
  bukti berupa state pada sebuah blok.
- Pemeriksaan yang belum dijalankan berstatus `unknown` tanpa klasifikasi.
- Pemilih snapshot, status data, dan respons error sama dengan endpoint
  ringkasan.

### `GET /api/tokens/:chain/:address/holders`

Sebaran pemegang: konsentrasi supply dan holder teratas pada snapshot.

- `concentration` berisi porsi 10 dan 50 holder teratas, bertag
  `derived_metric` karena dihitung dari saldo pada snapshot.
- Tiap holder membawa saldo mentah, saldo desimal, porsi supply, dan semua
  label entitasnya beserta sumber dan confidence. Urutan label: eksternal,
  heuristic, lalu catatan user.
- `?limit=` mengatur jumlah holder, 1 sampai 100, default 10.
- Label mencerminkan pengetahuan terbaru, bukan kondisi saat snapshot diambil.
- Pemilih snapshot, status data, dan respons error sama dengan endpoint
  ringkasan.

### `GET /api/tokens/:chain/:address/evidence`

Bukti transaksi yang mendukung temuan risiko dan cek kontrak pada snapshot.

- `findings` berisi semua temuan pada snapshot, urut dari yang paling parah,
  beserta jumlah buktinya. Daftar ini tetap lengkap walau ada filter, supaya
  pilihan filter di frontend selalu tersedia.
- Tiap bukti mencantumkan `relatedFindings` dan `relatedChecks`, yaitu kode
  temuan dan pemeriksaan yang didukungnya. Bukti terbaru tampil lebih dulu;
  bukti tanpa nomor blok, mis. asumsi, ada di akhir.
- `?finding=<kode>` hanya menampilkan bukti untuk satu temuan; kode yang tidak
  ada di snapshot dijawab `404`.
- `?classification=` menyaring menurut jenis informasi (`verified_fact`,
  `derived_metric`, `heuristic`, `external_label`, `assumption`,
  `unavailable`); nilai lain dijawab `400`. Kedua filter bisa digabung.
- Pemilih snapshot, status data, dan respons error sama dengan endpoint
  ringkasan.

## Merekam snapshot

`SnapshotRecorder` (`src/snapshots`) adalah sisi tulis data. Service ini dipakai
adapter dan job pengambilan data, dan sengaja tidak dibuka sebagai endpoint.

- `recordEvidence` menyimpan bukti secara idempotent lewat `evidence_key`.
- `recordSnapshot` menyimpan snapshot beserta sumber provider, holder, temuan,
  dan cek kontrak dalam satu transaksi. Merekam ulang blok yang sama mengganti
  isinya; input yang salah membatalkan seluruh perekaman.

Aturan yang diterapkan saat merekam:

| Hal | Aturan |
| --- | --- |
| Status data | Semua provider lengkap: `complete`. Ada yang sebagian atau gagal: `partial`. Ada yang memakai data lama: `stale`. Semua gagal atau tanpa provider: `unavailable`. |
| Klasifikasi temuan | Mengikuti bukti terlemahnya. Urutan kekuatan: `verified_fact`, `derived_metric`, `external_label`, `heuristic`, `assumption`, `unavailable`. Temuan tanpa bukti menjadi `assumption`. |
| Tingkat risiko | Dari skor: 0–24 rendah, 25–49 sedang, 50–74 tinggi, 75–100 kritis, tanpa skor `unknown`. |

## Skema data token

Skema ada di `src/database/schema`, migrasinya di `drizzle/`.

| Kelompok | Tabel |
| --- | --- |
| Referensi | `chains`, `addresses`, `labels`, `provider_runs` |
| Data token | `tokens`, `token_snapshots`, `token_snapshot_sources`, `holders` |
| Aktivitas | `transactions`, `token_transfers`, `trading_events` |
| Aliran dana | `native_transfers`, `address_flow_scans` (plus `token_transfers`) |
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
  termasuk total supply pada blok itu. Bukti punya `evidence_key` deterministik
  supaya penyimpanan idempotent.
- Semua chain dimulai dengan status `planned`. Chain baru boleh disebut
  didukung (`validated`) setelah adapter dan smoke test-nya lulus.
- Aliran dana: perpindahan native coin disimpan di `native_transfers`, baik
  nilai transaksi itu sendiri (`transaction`) maupun panggilan internal kontrak
  (`internal`, dengan `trace_path`); transfer bernilai nol ditolak. Pengirim dan
  penerima transfer (native maupun token) wajib address di chain yang sama.
  Nilai USD saat transaksi boleh kosong bila harganya tidak diketahui, tidak
  diisi nol.
- `address_flow_scans` mencatat rentang blok dan jenis transfer yang sudah
  dipindai per address. Status `complete` hanya sah bila native, token, dan
  transfer internal semuanya dipindai; `partial`/`unavailable` wajib dijelaskan.

Tabel `funding_edges`, `clusters`, `cluster_members`, dan `investigations`
menyusul di task fitur yang memakainya.
