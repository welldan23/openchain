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
| `npm run maps:build -- <chain> <token>` | Bentuk Peta Hubungan Wallet dari data tersimpan; `--holder=N`, `--kedalaman=N`, `--blok=N`, `--kumpulkan`, `--halaman=N`, `--json` |
| `npm test` | Tes unit, termasuk tes skema di PostgreSQL WebAssembly (PGlite) |
| `npm run test:e2e` | Tes endpoint lewat HTTP dengan database PGlite |
| `npm run typecheck` / `npm run lint` | Cek tipe dan lint |

Tes tidak memakai jaringan: RPC, Blockscout, dan Dexscreener diganti versi
palsu. Uji ke jaringan sungguhan dilakukan lewat `ingest`, `smoke:chain`, dan
`flows:collect`, dan `maps:build --kumpulkan`.

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

`--record` menyimpan smoke test utuh ke `chain_smoke_checks` sebagai bukti,
lalu memperbarui `chains.support_status` (menunjuk bukti itu lewat
`support_check_id`) dan status tiap kemampuan data di `chain_capabilities`.
Status tidak pernah dinaikkan lewat migrasi, hanya lewat smoke test di
lingkungan yang dipakai. Database menolak status selain `planned` tanpa smoke
test tersimpan; migrasi 0010 menurunkan status lama yang belum punya bukti ke
`planned`, jadi jalankan ulang `--record` setelah migrasi.

Kemampuan data per chain (`chain_capabilities`):

| Kemampuan | Dasar status |
| --- | --- |
| `token_snapshot` | Semua pemeriksaan RPC wajib lolos |
| `holders` | `indexer.holders` |
| `contract_info` | `explorer.contract` |
| `market_data` | `market.pairs` |
| `contract_security` | Minimal satu `security.*` lolos |
| `internal_traces` | `rpc.trace` (opsional) |
| `fund_flow` | Paling tinggi `experimental`: indexer holder lolos, tapi aliran dana belum punya smoke test sendiri |
| `multichain_profile` | Mengikuti `fund_flow` |

Kemampuan yang belum lolos tetap `planned` beserta alasannya; baris yang tidak
ada juga berarti `planned`.

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
- Label eksternal pihak transfer (tag Blockscout seperti exchange, router,
  pool) ikut disimpan dengan sumber dan run provider-nya; hanya tag yang jelas
  padanannya yang dipakai. Setelah itu jenis tiap perpindahan diklasifikasikan
  (`MovementClassificationService`, bisa diulang per address lewat
  `reclassifyAddress` saat label berubah). Endpoint daftar transfer, bukti
  transaksi, dan telusur menampilkannya di field `movement` (`null` bila belum
  diklasifikasikan).
- Pengumpulan ulang tidak menggandakan transfer, tapi tetap mencatat
  pemindaian baru. Nilai USD saat transaksi belum diisi (belum ada sumber harga
  historis), jadi kolomnya kosong, bukan nol.

## Membentuk peta hubungan

`WalletMapBuilder` (`src/maps`) membentuk satu Peta Hubungan Wallet dari data
yang sudah tersimpan, lalu menyimpannya ke `wallet_maps`, `map_nodes`, dan
`map_edges`. Service ini tidak memanggil provider; `npm run maps:build --
<chain> <token> --kumpulkan` lebih dulu membaca riwayat holder yang belum
lengkap lewat `FundFlowCollector`.

- Dasar peta adalah snapshot holder (terbaru, atau `--blok=N`), default 50
  holder teratas. Semua transfer dibatasi sampai blok snapshot, jadi peta bisa
  dibentuk ulang dengan hasil sama.
- Pendanaan ditelusuri ke belakang per lapis (`--kedalaman`, default 2,
  maksimal 5): tiga kiriman native paling awal ke tiap wallet, dan pendana
  lapis berikutnya harus mengirim sebelum dana diteruskan. Hub (exchange,
  router, bridge, pool, market maker), kontrak, dan pengirim kiriman internal
  tetap tampil sebagai pendana tapi tidak ditelusuri lebih jauh, karena dana di
  sana tercampur. Address nol/dead diabaikan.
- Wallet penghubung adalah address bukan holder yang bertransaksi token peta
  dengan minimal dua holder (bukan hub, kontrak, atau address nol), paling
  banyak 30. Transfer token di antara wallet peta ikut jadi garis, paling
  banyak 3 per pasangan arah.
- Setiap garis menunjuk satu transfer tersimpan. Batas peta: 400 wallet dan
  2.000 garis.
- Status `complete` hanya bila riwayat semua holder dan pendana yang ditelusuri
  terbaca lengkap (native, internal, dan token dari awal sampai blok peta) dan
  tidak ada batas yang memotong peta. Selain itu `partial`, dengan alasan dan
  `missing_fields` (`holder_history`, `funder_history`, `node_limit`,
  `edge_limit`, `connector_limit`). Snapshot tanpa holder disimpan sebagai
  `unavailable`.

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

Semua endpoint memakai prefix `/api` dan bersifat read-only terhadap blockchain.
Satu-satunya yang menulis ke database adalah `GET /api/maps`, yang menyimpan
peta yang baru dibentuk supaya bisa dibuka ulang.

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

### `GET /api/flows/:chain/:address/summary`

Ringkasan aliran masuk dan keluar satu address dari pemindaian yang tersimpan
(`npm run flows:collect`). Tidak menghubungi provider saat diminta.

| Parameter | Fungsi |
| --- | --- |
| tanpa parameter | pemindaian terbaru yang berhasil (bukan `unavailable`) |
| `?scan=<id>` | pemindaian tertentu, supaya hasil bisa direproduksi |
| `?at=<waktu ISO>` | pemindaian terakhir sampai waktu itu |
| `?range=24h\|7d\|30d\|all` | preset rentang, dihitung mundur dari akhir cakupan pemindaian (bukan dari sekarang) supaya bisa direproduksi |
| `?from=` / `?to=` (ISO) | rentang sendiri; tidak boleh digabung dengan `range`. Selalu dipotong ke cakupan (`window.clipped`) |

- `assets`: per aset (native dulu, lalu token), jumlah transfer, jumlah mentah
  (string, presisi uint256), jumlah dalam satuan aset bila desimal diketahui,
  dan selisih masuk dikurangi keluar (bisa negatif).
- `totals`: jumlah transfer dan lawan transaksi unik per arah. Transfer ke diri
  sendiri dihitung terpisah (`selfTransferCount`), tidak masuk maupun keluar.
- USD (`derived_metric`) hanya dari transfer yang punya harga saat transaksi;
  `unpricedCount` menyebut yang tidak. `netUsd` hanya diisi bila semua transfer
  punya harga.
- `scan` menjelaskan cakupan (rentang blok/waktu, jenis transfer yang terbaca,
  status, alasan). `lastFailedAttempt` muncul bila ada pemindaian lebih baru
  yang gagal. Status `stale` mengikuti `SNAPSHOT_STALE_AFTER_MINUTES`.
- Address yang tercatat tapi belum pernah dipindai, atau rentang di luar
  cakupan, menghasilkan `totals: null`: belum diketahui, bukan nol.
- Respons error: `404` untuk chain tak dikenal, address yang belum pernah
  dipindai, atau `scan` yang tidak ada; `400` untuk format address, waktu, id,
  atau `from` setelah `to`.

### `GET /api/flows/:chain/:address/transfers`

Daftar transfer satu address, terbaru dulu, dengan pemilih pemindaian dan
rentang yang sama dengan ringkasan (`scan`, `at`, `range`, `from`/`to`).

- `?direction=in|out` menyaring arah. Transfer ke diri sendiri muncul dengan
  arah `self` bila arah tidak disaring.
- `?limit=` 1–200 (default 50). `nextCursor` dipakai sebagai `?cursor=` untuk
  halaman berikutnya; cursor keyset (blok, jenis, id) sehingga halaman tidak
  bergeser walau ada data baru.
- Tiap item: arah, jenis transfer (`native`/`internal`/`token`), lawan
  transaksi beserta labelnya, aset, jumlah mentah dan desimal, nilai USD saat
  transaksi (`null` bila tidak diketahui), hash, blok, dan waktu.

### `GET /api/flows/:address/chains`

Status aliran dana sebuah address di setiap chain yang format address-nya
cocok (address `0x…` di chain EVM, base58 di Solana), urut prioritas adapter.
Chain fase 4 (Bitcoin, Tron, TON) belum punya aturan address, jadi belum
ditampilkan.

- `?chains=ethereum,base` membatasi chain; chain tak dikenal, format address
  yang tidak cocok, atau chain fase 4 menghasilkan `400`.
- Tiap chain: apakah address sudah tercatat, pemindaian terbaru yang berhasil,
  percobaan gagal sesudahnya, dan jumlah transfer dalam cakupan. Chain yang
  belum dipindai punya `transferCount: null` (belum diketahui), bukan `0`.

### `GET /api/transactions/:chain/:hash`

Bukti satu transaksi untuk modal bukti, dari data yang tersimpan.

- `movements`: semua perpindahan dana dalam transaksi itu (nilai transaksi,
  panggilan internal urut trace, lalu transfer token urut log), dengan pengirim,
  penerima, label beserta sumbernya, aset, dan jumlah. Semuanya
  `verified_fact`.
- `transaction`: method, status sukses, dan nilai bila detail transaksinya
  sudah diambil; `null` bila hanya transfernya yang tercatat.
- `claims`: klaim analisis (mis. temuan risiko) yang memakai transaksi ini
  sebagai bukti, lengkap dengan klasifikasinya. `sources`: provider yang
  mencatat perpindahan tersebut. `explorerUrl` menuju halaman transaksi.
- Hash tidak peka huruf besar-kecil untuk EVM. Transaksi yang belum tercatat
  di data yang dipindai dijawab `404`, bukan dikarang; format hash yang salah
  dijawab `400`.

### `GET /api/traces/:chain/:from/:to`

Jalur dana dari satu wallet ke wallet lain lewat transfer yang tersimpan
(native dan token), dengan langkah paling sedikit. Tidak menghubungi provider.

| Parameter | Fungsi |
| --- | --- |
| `?maxHops=` | batas langkah, 1–6 (default 4) |
| `?throughHubs=true` | ikut menelusuri lewat exchange, router, bridge, pool, atau market maker |

- Urutan waktu dijaga: langkah berikutnya harus di blok yang sama atau sesudah
  dana tiba. Di antara jalur sepanjang sama, dipilih yang paling awal sampai.
- Tiap langkah adalah transfer on-chain (`verified_fact`); anggapan bahwa dana
  yang sama berpindah sepanjang jalur adalah dugaan (`pathClassification:
  heuristic`).
- Hub tidak dilewati secara default karena dana di sana tercampur; hub tetap
  boleh jadi tujuan. Bila dilewati, `caveats` memperingatkannya.
- `found: false` berarti tidak ada jalur dalam data yang sudah dipindai, bukan
  pasti tidak ada. `search` melaporkan address yang dikunjungi, transfer yang
  diperiksa, address yang belum pernah dipindai, hub yang dilewati, dan apakah
  pencarian terpotong; `dataStatus` turun ke `partial` bila hal itu bisa
  menyembunyikan jalur.
- Respons error: `404` untuk chain tak dikenal atau address asal yang belum
  pernah dipindai; `400` untuk format address, asal sama dengan tujuan, atau
  parameter yang salah.

### `GET /api/maps/:chain/:token`

Peta Hubungan Wallet satu token: holder teratas, pendananya, wallet
penghubung, dan garis transfer di antara mereka. Kontraknya ada di
`src/maps/maps.types.ts`. Query: `radius` (0–5, default 2), `holders` (1–1000,
default 50), `map` (id peta tersimpan), dan filter (lihat di bawah).

- Peta tersimpan dipakai ulang (`map.reused: true`) bila dibentuk dari snapshot
  terbaru dengan jumlah holder sama, kedalamannya ≥ radius, dan belum ada
  pemindaian aliran dana baru di chain itu sesudahnya. Selain itu peta dibentuk
  dari data tersimpan (lihat *Membentuk peta hubungan*), minimal sedalam 2
  lapis. Provider tidak dihubungi saat diminta.
- `radius` memotong peta ke wallet yang jaraknya paling banyak N garis dari
  holder mana pun (`distance` di tiap node): holder 0, pendana langsung dan
  penghubung 1, pendana dari pendana 2. Garis ikut bila kedua ujungnya masih di
  dalam radius.
- `?map=<id>` membuka peta lama dengan hasil yang sama; radius tidak boleh
  melebihi kedalaman peta itu.
- Setiap garis adalah transfer on-chain (`verified_fact`) dengan hash, blok,
  aset, dan jumlahnya. `caveats` mengingatkan bahwa kedekatan di peta bukan
  bukti kepemilikan yang sama, dan menyebut hub/kontrak yang tidak ditelusuri.
- Label wallet: label tersimpan (mis. tag Blockscout) dulu, lalu label dugaan
  dari data peta dengan sumber `OpenChain heuristic` dan keyakinannya: `burn`
  (address nol/dead, 1), `deployer` (pembuat kontrak token, 0,9), `bot`
  (holder di kelompok berlabel `bundled_or_sniper_activity`, 0,5), dan `whale`
  (holder biasa ≥1% supply tanpa label lain, 0,6). Label dugaan bergantung
  pada token, jadi tidak disimpan sebagai label global address.
- Filter: `hide` (jenis label utama dipisah koma, `none` = tanpa label),
  `labelSource` (`external`/`heuristic`; wallet tanpa label ikut tersembunyi),
  `from`/`to` (waktu transfer garis, ISO dengan zona waktu), dan `kinds`
  (`funding`, `token_transfer`). Garis disaring waktu/jenis sebelum radius,
  jadi wallet yang tak lagi terhubung ikut keluar; wallet disaring label
  sesudahnya, beserta garisnya. `labelCounts` (jumlah per jenis label utama
  sebelum filter label) dan `filter` (yang dipakai dan berapa yang
  disembunyikan) ada di respons. Nilai filter yang tidak dikenal dijawab `400`.
- `map.status`/`statusReason`/`missingFields` adalah kelengkapan saat peta
  dibentuk; `dataStatus` menjadi `stale` bila snapshot dasarnya sudah lama.
- `emptyState` menjelaskan bila tidak ada wallet atau garis yang tampil:
  `reason` (`no_snapshot`, `no_holders`, `filtered_out`, `no_history`,
  `no_connections`), `scope` (`nodes` = tidak ada wallet, `edges` = wallet tanpa
  garis), judul, penjelasan sederhana, `nextSteps`, dan `actions` untuk tombol
  (`ingest_token`, `collect_holder_history`, `reset_filter`, `widen_radius`).
  Riwayat yang belum dipindai (`no_history`) dibedakan dari holder yang memang
  tidak saling bertransaksi (`no_connections`); keduanya bukan tanda token
  aman. `null` bila peta punya wallet dan garis.
- Token yang dikenal tapi belum punya snapshot dijawab `200` dengan `map: null`,
  daftar kosong, `dataStatus: unavailable`, dan `emptyState.reason:
  no_snapshot`, supaya halaman tetap bisa menampilkan nama token dan langkah
  berikutnya.
- Respons error: `404` untuk chain atau token yang belum pernah diambil
  datanya, atau peta yang bukan milik token itu; `400` untuk format address
  atau parameter yang salah.

### `GET /api/maps/:chain/:token/clusters`

Kelompok wallet di sebuah peta (`?map=<id>`, atau peta terbaru token ini).
Respons peta (`GET /api/maps/:chain/:token`) juga memuat `clusters`,
`clustering`, dan `clusterId` di tiap node.

- Dihitung sekali per peta dengan heuristic `openchain-cluster-v1`, lalu
  disimpan di `map_clusters` beserta anggota, sinyal, dan transfer buktinya.
  `wallet_maps.clustered_at` membedakan "belum dianalisis" dari "tidak ada
  kelompok". Data yang dipakai hanya garis peta dan transfer sampai blok peta,
  jadi peta lama tetap memberi kelompok yang sama.
- Holder disatukan bila punya pendana yang sama (langsung atau beberapa lapis),
  saling kirim langsung, atau memakai wallet penghubung yang sama. Exchange,
  router, bridge, pool, market maker, kontrak, dan pengirim yang hanya lewat
  kiriman internal tidak pernah menyatukan wallet. Kelompok minimal dua holder.
- Tiap kelompok membawa tujuh sinyal yang dicek, terpenuhi atau tidak, dengan
  bukti transfernya: pendana yang sama, didanai dalam 60 menit, saling kirim
  langsung, perantara yang sama, menerima token peta pertama kali di blok yang
  sama, dana kembali ke pendana, dan menerima langsung dari deployer.
- Label: `common_funding`, `likely_linked` (saling kirim atau dana kembali),
  `bundled_or_sniper_activity` (blok penerimaan sama), `insider_or_team` hanya
  bila ada transfer langsung dari deployer (database juga menolaknya tanpa
  bukti itu), `visual_cluster` + `inconclusive` bila hanya lewat perantara, dan
  `false_positive_possible` bila hanya satu sinyal kuat atau satu pendana
  menyatukan 10 holder atau lebih. Keyakinan `high` untuk transfer dari
  deployer atau minimal tiga sinyal kuat, `medium` untuk dua, selain itu `low`.
- Semua kelompok berklasifikasi `heuristic`; `caveats` menyebut hal yang bisa
  membuatnya keliru. Tidak ada kelompok bukan bukti bahwa holder tidak terkait.
- Respons error: `404` bila token belum punya peta atau peta bukan milik token
  itu; `400` untuk parameter yang salah.

### `GET /api/maps/:chain/:token/coordination`

Gerak serempak di antara holder sebuah peta (`?map=<id>`, atau peta terbaru
token ini). Respons peta juga memuat `coordination` dan `coordinationAnalysis`.

- Dideteksi sekali per peta dengan heuristic `openchain-coordination-v1`, lalu
  disimpan di `coordination_events` beserta anggota dan transaksinya;
  `wallet_maps.coordinated_at` menandai peta yang sudah dianalisis.
- Jenis kejadian: `funding_burst` (satu pendana mendanai ≥3 holder dalam 10
  menit, pola Sybil), `similar_amount` (satu pendana mengirim jumlah yang
  hampir sama, selisih ≤1%, ke ≥3 holder), `same_block_buy` (≥2 holder membeli
  di blok yang sama, pola bundler), dan `coordinated_sell` (≥2 holder menjual
  dalam 5 menit). Maksimal 20 kejadian per jenis.
- Beli = menerima token peta dari pool, router, atau kontrak; jual =
  mengirimnya ke sana. Holder berupa exchange/hub/kontrak dan pendana
  exchange/hub tidak dihitung.
- Tiap transaksi pendukung adalah transfer tersimpan (`verified_fact`) dengan
  aksi, pihak, aset, dan jumlahnya; kejadiannya sendiri `heuristic`. `caveats`
  mengingatkan bahwa gerak serempak bisa kebetulan dan beli/jual hanya
  dikenali bila lawan transaksinya diketahui.
- Respons error: `404` bila token belum punya peta atau peta bukan milik token
  itu; `400` untuk parameter yang salah.

### `GET /api/maps/:chain/:token/coordination/:findingId`

Detail satu temuan koordinasi. `findingId` adalah `id` kejadian di daftar
koordinasi (encode untuk URL, mis. `same_block_buy%3A300`); `?map=<id>`
memilih petanya, tanpa itu dipakai peta terbaru token ini yang memuatnya.

- `finding`: kejadiannya dan transaksi pendukung, masing-masing dengan
  `movement` (jenis perpindahan dan dasarnya; `null` bila belum
  diklasifikasikan).
- `parties`: semua pihak di transaksi pendukung dan anggota temuan, dengan
  peran di peta (`null` bila di luar peta, mis. router), porsi supply, status
  kontrak, label (termasuk label dugaan peta), `member`, dan `clusterId`.
- `blocks` dan `sameBlockTransactions`: blok yang dipakai dan berapa transaksi
  yang berbagi blok. `relatedClusters`: kelompok wallet yang memuat anggota
  temuan.
- `caveats` dimulai dengan penjelasan alternatif khusus jenis temuannya (mis.
  bot publik saat peluncuran untuk `same_block_buy`).
- Respons error: `404` bila temuan tidak ada di peta, atau peta bukan milik
  token itu; `400` untuk parameter yang salah.

### `GET /api/maps/:chain/:token/edges/:edgeId`

Detail satu garis peta. `edgeId` adalah `id` garis di respons peta
(`native:<id>` atau `token:<id>`); `?map=<id>` memilih petanya, tanpa itu
dipakai peta terbaru token ini yang memuat garis tersebut.

- `edge`: transfernya (aset, jumlah, hash, blok) dan `movement`, jenis
  perpindahan beserta dasarnya (`null` bila belum diklasifikasikan).
- `from`/`to`: kedua wallet beserta peran, porsi supply, status kontrak, dan
  labelnya. `relatedEdges`: garis lain di peta yang sama di antara dua wallet
  ini, ke dua arah.
- `transaction`: bukti transaksi lengkap, sama dengan
  `GET /api/transactions/:chain/:hash` (semua perpindahan dana di transaksi itu,
  klaim yang memakainya, dan sumbernya).
- `caveats` mengingatkan bahwa transfer bukan bukti kepemilikan yang sama, dan
  menyebut ujung yang berupa exchange, pool, atau kontrak.
- Respons error: `400` untuk id garis yang salah format; `404` bila garis tidak
  ada di peta, atau peta bukan milik token itu.

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
| Referensi | `chains`, `chain_smoke_checks`, `chain_capabilities`, `info_classification_labels`, `addresses`, `labels`, `provider_runs` |
| Data token | `tokens`, `token_snapshots`, `token_snapshot_sources`, `holders` |
| Aktivitas | `transactions`, `token_transfers`, `trading_events` |
| Aliran dana | `native_transfers`, `address_flow_scans`, `movement_classifications` (plus `token_transfers`) |
| Lintas chain | `multichain_scans`, `multichain_chain_activity`, `bridge_transfers`, `infrastructure_protocols`, `infrastructure_contracts` |
| Peta hubungan | `wallet_maps`, `map_nodes`, `map_edges`, `map_clusters` (+ `map_cluster_members`, `map_cluster_signals`, `map_cluster_signal_evidence`), `coordination_events` (+ `coordination_event_members`, `coordination_txs`) |
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
  didukung (`validated`) setelah adapter dan smoke test-nya lulus; status
  selain `planned` (chain maupun kemampuannya) wajib menunjuk smoke test
  tersimpan.
- `info_classification_labels` berisi nama dan penjelasan tiap jenis
  informasi (fakta on-chain, kalkulasi, label eksternal, dugaan, asumsi, tidak
  tersedia) supaya semua halaman memakai istilah yang sama.
- Aliran dana: perpindahan native coin disimpan di `native_transfers`, baik
  nilai transaksi itu sendiri (`transaction`) maupun panggilan internal kontrak
  (`internal`, dengan `trace_path`); transfer bernilai nol ditolak. Pengirim dan
  penerima transfer (native maupun token) wajib address di chain yang sama.
  Nilai USD saat transaksi boleh kosong bila harganya tidak diketahui, tidak
  diisi nol.
- `address_flow_scans` mencatat rentang blok dan jenis transfer yang sudah
  dipindai per address. Status `complete` hanya sah bila native, token, dan
  transfer internal semuanya dipindai; `partial`/`unavailable` wajib dijelaskan.

- `movement_classifications` menyimpan jenis tiap perpindahan (transfer biasa,
  mint, burn, setor/tarik exchange, bridge keluar/masuk, interaksi DEX) dan
  klasifikasi informasinya. Transfer biasa dan mint/burn (address nol) adalah
  `verified_fact`; jenis yang lahir dari label mengikuti sumber labelnya
  (`external_label`, `heuristic` dengan confidence, atau `assumption` untuk
  label user), dan database menolak jenis berbasis label yang disebut fakta.
  Disimpan terpisah dari transfer supaya bisa dihitung ulang saat label berubah.

- Peta hubungan disimpan per pembangunan (`wallet_maps`: token, snapshot
  holder dasar, blok, parameter, status data) supaya bisa dibuka ulang dengan
  hasil sama. Node (`map_nodes`) wajib address di chain peta; porsi supply
  hanya untuk holder, wallet pendana/penghubung selalu 0. Setiap garis
  (`map_edges`) wajib menunjuk tepat satu transfer tersimpan sebagai bukti
  transaksinya dan hanya boleh menghubungkan node dari peta yang sama.
  Menghapus peta menghapus node dan garisnya, tidak transfernya.
- Kelompok wallet (`map_clusters`) dan kejadian koordinasi
  (`coordination_events`) selalu `heuristic`: dugaan dari pola transaksi,
  lengkap dengan nama heuristic, tingkat keyakinan, dan catatan hal yang bisa
  membuatnya keliru. Kelompok wajib punya minimal satu label, dan label
  `insider_or_team` ditolak tanpa bukti transaksi langsung
  (`has_direct_evidence`). Satu wallet paling banyak masuk satu kelompok per
  peta, dan anggota kelompok/kejadian wajib node dari peta yang sama. Bukti
  sinyal dan transaksi koordinasi menunjuk tepat satu transfer tersimpan, jadi
  pihak, jumlah, dan waktunya tetap fakta on-chain. Semuanya ikut terhapus
  bersama peta, transfernya tidak.

- Aktivitas lintas chain disimpan per pemindaian (`multichain_scans`: address
  per keluarga chain, rentang waktu, status gabungan) dengan satu ringkasan per
  chain (`multichain_chain_activity`) yang menunjuk pemindaian aliran dana
  dasarnya. Chain yang tidak terbaca wajib punya alasan dan tidak boleh punya
  angka; angka yang belum diketahui kosong, bukan nol. Address wajib dari chain
  baris itu.
- `bridge_transfers` menyimpan perpindahan lewat bridge. Kaki kirim adalah
  transfer tersimpan di chain asal; kaki terima transfer di chain tujuan
  (dijaga foreign key komposit, jadi tidak bisa tertukar chain). `matched`
  wajib menunjuk kaki terima, penerima, jumlah, waktu, nama heuristic, dan
  keyakinan; `pending`/`unmatched` tidak boleh punya kaki terima. Pencocokan
  selalu `heuristic` dan penerimaan tidak boleh sebelum pengiriman.
- Jembatan dan router dikelompokkan per protokol (`infrastructure_protocols`:
  bridge, router, atau aggregator) dengan kontraknya per chain
  (`infrastructure_contracts`: peran pintu masuk/keluar bridge atau router).
  Setiap pengenalan menyimpan sumbernya dengan aturan yang sama seperti
  `labels` (eksternal = `external_label`, heuristic wajib keyakinan, user =
  `assumption`) dan bila merujuk label, label itu wajib milik address yang
  sama. Satu kontrak boleh dikenali beberapa sumber. Address kontrak tidak
  diisi dari ingatan: hanya dari sumber yang bisa ditelusuri.
  `bridge_transfers.protocol_id` menunjuk protokol bridge yang dipakai.

Tabel `investigations` menyusul di task fitur yang memakainya.
