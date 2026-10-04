import type {
  ActivityType,
  CaseDataStatus,
  CaseStatus,
  DangerCategory,
  DangerTrait,
  DangerTraitStatus,
  ClusterConfidence,
  ClusterLabel,
  CoordinationKind,
  CoordinationTxAction,
  CrossChainActivityKind,
  ContractCheckStatus,
  EntityLabelType,
  FindingClassification,
  FlowDirection,
  InfoClassification,
  ReportStatus,
  RiskLevel,
  RiskObjectKind,
  RiskSeverity,
} from "./types";

interface Meta {
  label: string;
  /** Kelas Tailwind untuk badge (warna latar, teks, ring). */
  className: string;
}

/** Urutan baku tag klasifikasi, dari bukti terkuat ke terlemah. */
export const CLASSIFICATION_ORDER: FindingClassification[] = [
  "fact",
  "calculation",
  "external_label",
  "heuristic",
  "assumption",
];

/** Urutan legenda jenis informasi: klasifikasi temuan, lalu data yang tidak tersedia. */
export const INFO_CLASSIFICATION_ORDER: InfoClassification[] = [...CLASSIFICATION_ORDER, "unavailable"];

export const CLASSIFICATION_META: Record<
  InfoClassification,
  Meta & { description: string; howToCheck: string }
> = {
  fact: {
    label: "Fakta on-chain",
    description: "Tercatat langsung di blockchain dan bisa dicek lewat hash transaksi.",
    howToCheck: "Buka hash buktinya di explorer; transaksinya harus ada dan isinya sama.",
    className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  },
  calculation: {
    label: "Kalkulasi",
    description: "Hasil hitungan dari data on-chain pada waktu snapshot.",
    howToCheck: "Hitung ulang dari data di blok snapshot; angkanya bisa berubah di blok lain.",
    className: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
  },
  heuristic: {
    label: "Heuristic",
    description: "Dugaan berbasis pola. Selalu estimasi, bukan kepastian.",
    howToCheck: "Lihat bukti dan tingkat keyakinannya; pola yang sama bisa punya penjelasan lain.",
    className: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  },
  external_label: {
    label: "Label eksternal",
    description: "Berasal dari sumber pihak ketiga, bukan hasil analisis internal.",
    howToCheck: "Perhatikan nama sumbernya; label pihak ketiga bisa keliru atau sudah usang.",
    className: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
  },
  assumption: {
    label: "Asumsi",
    description: "Belum terverifikasi on-chain. Perlakukan sebagai klaim.",
    howToCheck: "Cari transaksi yang membuktikannya; sampai ada, jangan jadikan dasar kesimpulan.",
    className: "bg-slate-500/20 text-slate-300 ring-slate-400/30",
  },
  unavailable: {
    label: "Data tidak tersedia",
    description: "Sumber data gagal dihubungi atau belum dipindai. Nilainya tidak ditebak dan tidak dianggap nol.",
    howToCheck: "Coba muat ulang nanti, dan lihat status sumber data di bagian snapshot.",
    className: "bg-rose-500/10 text-rose-300 ring-rose-400/30",
  },
};

/** Garis tepi kiri sebagai penanda jenis informasi pada kartu klaim; warnanya sama dengan badge. */
export const CLASSIFICATION_STRIPE: Record<InfoClassification, string> = {
  fact: "border-l-emerald-400",
  calculation: "border-l-sky-400",
  heuristic: "border-l-amber-400",
  external_label: "border-l-violet-400",
  assumption: "border-l-slate-400",
  unavailable: "border-l-rose-400",
};

/**
 * Nada risiko: satu set warna untuk tingkat risiko objek dan keparahan
 * temuan, supaya "tinggi" selalu tampil sama di mana pun. Ikonnya ada di
 * `components/risk/risk-icons.ts`; tingkatnya selalu ditulis, bukan warna saja.
 */
export type RiskTone = "critical" | "high" | "medium" | "low" | "neutral";

export const RISK_TONES: Record<RiskTone, { className: string; barClass: string; textClass: string; calloutClass: string }> = {
  critical: {
    className: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
    barClass: "bg-rose-400",
    textClass: "text-rose-300",
    calloutClass: "border-rose-400/30 bg-rose-500/10 text-rose-200",
  },
  high: {
    className: "bg-orange-500/15 text-orange-300 ring-orange-400/40",
    barClass: "bg-orange-400",
    textClass: "text-orange-300",
    calloutClass: "border-orange-400/30 bg-orange-500/10 text-orange-200",
  },
  medium: {
    className: "bg-amber-500/15 text-amber-300 ring-amber-400/40",
    barClass: "bg-amber-400",
    textClass: "text-amber-300",
    calloutClass: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  },
  low: {
    className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
    barClass: "bg-emerald-400",
    textClass: "text-emerald-300",
    calloutClass: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  },
  neutral: {
    className: "bg-slate-500/20 text-slate-300 ring-slate-400/30",
    barClass: "bg-slate-400",
    textClass: "text-slate-300",
    calloutClass: "border-line bg-surface-raised text-foreground/80",
  },
};

export const RISK_LEVEL_TONE: Record<RiskLevel, RiskTone> = {
  unknown: "neutral",
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical",
};

export const SEVERITY_TONE: Record<RiskSeverity, RiskTone> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "neutral",
};

const SEVERITY_LABELS: Record<RiskSeverity, string> = { critical: "Kritis", high: "Tinggi", medium: "Sedang", low: "Rendah", info: "Info" };

export const SEVERITY_META: Record<RiskSeverity, Meta & { tone: RiskTone; textClass: string; calloutClass: string }> = Object.fromEntries(
  (Object.keys(SEVERITY_LABELS) as RiskSeverity[]).map((severity) => {
    const tone = SEVERITY_TONE[severity];
    const { className, textClass, calloutClass } = RISK_TONES[tone];
    return [severity, { label: SEVERITY_LABELS[severity], tone, className, textClass, calloutClass }];
  }),
) as Record<RiskSeverity, Meta & { tone: RiskTone; textClass: string; calloutClass: string }>;

const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  unknown: "Belum dinilai",
  low: "Risiko rendah",
  medium: "Risiko sedang",
  high: "Risiko tinggi",
  critical: "Risiko kritis",
};

export const RISK_LEVEL_META: Record<RiskLevel, Meta & { tone: RiskTone; barClass: string; textClass: string }> = Object.fromEntries(
  (Object.keys(RISK_LEVEL_LABELS) as RiskLevel[]).map((level) => {
    const tone = RISK_LEVEL_TONE[level];
    const { className, barClass, textClass } = RISK_TONES[tone];
    return [level, { label: RISK_LEVEL_LABELS[level], tone, className, barClass, textClass }];
  }),
) as Record<RiskLevel, Meta & { tone: RiskTone; barClass: string; textClass: string }>;

export const ENTITY_LABEL_META: Record<EntityLabelType, Meta> = {
  exchange: { label: "Exchange", className: "bg-violet-500/15 text-violet-300 ring-violet-400/30" },
  router: { label: "Router", className: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30" },
  bridge: { label: "Bridge", className: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30" },
  market_maker: {
    label: "Market maker",
    className: "bg-indigo-500/15 text-indigo-300 ring-indigo-400/30",
  },
  treasury: { label: "Treasury", className: "bg-teal-500/15 text-teal-300 ring-teal-400/30" },
  bot: { label: "Bot", className: "bg-amber-500/15 text-amber-300 ring-amber-400/30" },
  whale: { label: "Whale", className: "bg-blue-500/15 text-blue-300 ring-blue-400/30" },
  deployer: { label: "Deployer", className: "bg-rose-500/15 text-rose-300 ring-rose-400/30" },
  liquidity_pool: {
    label: "Pool likuiditas",
    className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  },
  burn: { label: "Burn", className: "bg-slate-500/20 text-slate-300 ring-slate-400/30" },
  unknown: { label: "Belum dikenal", className: "bg-slate-500/20 text-slate-400 ring-slate-400/20" },
};

export const ACTIVITY_META: Record<ActivityType, Meta> = {
  deploy: { label: "Deploy", className: "bg-violet-500/15 text-violet-300 ring-violet-400/30" },
  mint: { label: "Mint", className: "bg-violet-500/15 text-violet-300 ring-violet-400/30" },
  add_liquidity: {
    label: "Tambah likuiditas",
    className: "bg-teal-500/15 text-teal-300 ring-teal-400/30",
  },
  remove_liquidity: {
    label: "Tarik likuiditas",
    className: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  },
  buy: { label: "Beli", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" },
  sell: { label: "Jual", className: "bg-orange-500/15 text-orange-300 ring-orange-400/30" },
  transfer: { label: "Transfer", className: "bg-sky-500/15 text-sky-300 ring-sky-400/30" },
  burn: { label: "Burn", className: "bg-slate-500/20 text-slate-300 ring-slate-400/30" },
};

export const CHECK_STATUS_META: Record<ContractCheckStatus, Meta & { iconClass: string }> = {
  fail: {
    label: "Berisiko",
    className: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
    iconClass: "text-rose-400",
  },
  warn: {
    label: "Perlu perhatian",
    className: "bg-amber-500/15 text-amber-300 ring-amber-400/40",
    iconClass: "text-amber-400",
  },
  unknown: {
    label: "Belum dicek",
    className: "bg-slate-500/20 text-slate-300 ring-slate-400/30",
    iconClass: "text-slate-400",
  },
  pass: {
    label: "Lolos",
    className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
    iconClass: "text-emerald-400",
  },
};

export const FLOW_DIRECTION_META: Record<FlowDirection, Meta> = {
  in: { label: "Masuk", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" },
  out: { label: "Keluar", className: "bg-orange-500/15 text-orange-300 ring-orange-400/30" },
};

/** Label klaster dari PRD dengan penjelasan sederhana. */
export const CLUSTER_LABEL_META: Record<ClusterLabel, Meta & { description: string }> = {
  visual_cluster: {
    label: "Berdekatan di peta",
    description: "Tampak berkelompok di peta, tapi belum ada pola transaksi yang menguatkan.",
    className: "bg-slate-500/20 text-slate-300 ring-slate-400/30",
  },
  common_funding: {
    label: "Pendana sama",
    description: "Wallet-wallet ini mendapat modal dari sumber yang sama.",
    className: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
  },
  coordinated_execution: {
    label: "Gerak terkoordinasi",
    description: "Beli atau jual di waktu, blok, atau nominal yang sangat mirip.",
    className: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  },
  bundled_or_sniper_activity: {
    label: "Pola bundler/sniper",
    description: "Membeli di blok peluncuran atau bersamaan dengan penambahan likuiditas.",
    className: "bg-orange-500/15 text-orange-300 ring-orange-400/30",
  },
  market_maker_possible: {
    label: "Mungkin market maker",
    description: "Pola transaksi mirip penyedia likuiditas profesional.",
    className: "bg-indigo-500/15 text-indigo-300 ring-indigo-400/30",
  },
  likely_linked: {
    label: "Kemungkinan terkait",
    description: "Ada hubungan transaksi langsung, tapi belum cukup untuk menyebut pemilik yang sama.",
    className: "bg-teal-500/15 text-teal-300 ring-teal-400/30",
  },
  insider_or_team: {
    label: "Orang dalam/tim",
    description: "Ada bukti transaksi langsung dengan pembuat token atau deployer.",
    className: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
  },
  false_positive_possible: {
    label: "Bisa salah duga",
    description: "Ada penjelasan lain yang wajar untuk pola ini.",
    className: "bg-slate-500/20 text-slate-300 ring-slate-400/30",
  },
  inconclusive: {
    label: "Belum bisa disimpulkan",
    description: "Data belum cukup untuk menilai hubungan wallet-wallet ini.",
    className: "bg-slate-500/20 text-slate-400 ring-slate-400/20",
  },
};

export const CLUSTER_CONFIDENCE_META: Record<ClusterConfidence, { label: string; level: number }> = {
  low: { label: "Keyakinan rendah", level: 1 },
  medium: { label: "Keyakinan sedang", level: 2 },
  high: { label: "Keyakinan tinggi", level: 3 },
};

export const COORDINATION_KIND_META: Record<CoordinationKind, { label: string; description: string }> = {
  funding_burst: {
    label: "Pendanaan beruntun",
    description: "Beberapa wallet didanai dari sumber yang sama dalam waktu sangat singkat.",
  },
  same_block_buy: {
    label: "Beli di blok yang sama",
    description: "Beberapa wallet membeli di blok yang sama, sering bersamaan dengan penambahan likuiditas.",
  },
  similar_amount: {
    label: "Nominal mirip",
    description: "Jumlah yang dikirim atau dibeli hampir sama di antara wallet.",
  },
  coordinated_sell: {
    label: "Jual bersamaan",
    description: "Beberapa wallet menjual dalam rentang waktu yang sangat berdekatan.",
  },
};

export const COORDINATION_TX_ACTION_META: Record<CoordinationTxAction, Meta> = {
  funding: { label: "Pendanaan", className: "bg-sky-500/15 text-sky-300 ring-sky-400/30" },
  buy: { label: "Beli", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" },
  sell: { label: "Jual", className: "bg-orange-500/15 text-orange-300 ring-orange-400/30" },
  add_liquidity: { label: "Tambah likuiditas", className: "bg-teal-500/15 text-teal-300 ring-teal-400/30" },
  transfer: { label: "Transfer", className: "bg-slate-500/20 text-slate-300 ring-slate-400/30" },
};

export const BRIDGE_STATUS_META: Record<"matched" | "pending" | "unmatched", Meta & { description: string }> = {
  matched: {
    label: "Cocok",
    description: "Penerimaan di chain tujuan ditemukan dengan jumlah dan waktu yang masuk akal.",
    className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  },
  pending: {
    label: "Menunggu",
    description: "Kiriman masih baru; penerimaan di chain tujuan bisa belum terjadi.",
    className: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  },
  unmatched: {
    label: "Belum ketemu",
    description: "Penerimaan di chain tujuan belum ditemukan. Bisa ke address lain atau lewat jalur yang belum terbaca.",
    className: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  },
};

export const CROSS_CHAIN_KIND_META: Record<CrossChainActivityKind, Meta> = {
  in: { label: "Masuk", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" },
  out: { label: "Keluar", className: "bg-orange-500/15 text-orange-300 ring-orange-400/30" },
  bridge_out: { label: "Kirim ke bridge", className: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30" },
  bridge_in: { label: "Terima dari bridge", className: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30" },
};

/** Tahap kasus investigasi. */
export const CASE_STATUS_META: Record<CaseStatus, Meta & { description: string }> = {
  open: {
    label: "Diselidiki",
    description: "Kasus masih aktif diselidiki.",
    className: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
  },
  monitoring: {
    label: "Dipantau",
    description: "Temuan utama sudah ada; kasus dibuka lagi bila ada aktivitas baru.",
    className: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  },
  closed: {
    label: "Ditutup",
    description: "Penyelidikan selesai. Snapshot data tetap tersimpan untuk dibuka ulang.",
    className: "bg-slate-500/20 text-slate-300 ring-slate-400/30",
  },
};

/** Kelengkapan data kasus saat snapshot diambil. */
export const CASE_DATA_STATUS_META: Record<CaseDataStatus, Meta & { description: string }> = {
  complete: {
    label: "Data lengkap",
    description: "Semua sumber data menjawab saat snapshot diambil.",
    className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  },
  partial: {
    label: "Data sebagian",
    description: "Sebagian sumber data tidak lengkap; temuan bisa berubah setelah data lengkap.",
    className: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  },
  stale: {
    label: "Data tertinggal",
    description: "Snapshot sudah lama atau tertinggal dari jaringan; aktivitas terbaru belum masuk.",
    className: "bg-orange-500/15 text-orange-300 ring-orange-400/30",
  },
  unavailable: {
    label: "Data tidak tersedia",
    description: "Sumber data gagal dihubungi; hasil tidak dikarang.",
    className: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  },
};

/** Jenis objek yang dinilai risikonya. */
export const RISK_OBJECT_KIND_META: Record<RiskObjectKind, { label: string; description: string }> = {
  token: { label: "Token", description: "Kontrak token beserta pasar dan holdernya." },
  wallet: { label: "Wallet", description: "Address biasa yang dikendalikan seseorang atau bot." },
  contract: { label: "Kontrak", description: "Kontrak selain token, mis. pool likuiditas atau router." },
};

/** Kategori ciri berbahaya, dalam urutan tampil. */
export const DANGER_CATEGORY_META: Record<DangerCategory, { label: string }> = {
  contract: { label: "Kontrak" },
  liquidity: { label: "Likuiditas" },
  holders: { label: "Holder" },
  flow: { label: "Aliran dana" },
};

export const DANGER_TRAIT_META: Record<DangerTrait, { label: string; category: DangerCategory; description: string }> = {
  tax_change: { label: "Pajak bisa diubah owner", category: "contract", description: "Owner bisa menaikkan pajak jual sampai token sulit dijual." },
  mint_active: { label: "Supply bisa dicetak", category: "contract", description: "Supply baru bisa dicetak dan menekan harga." },
  sell_blocked: { label: "Tidak bisa dijual (honeypot)", category: "contract", description: "Pembeli tidak bisa menjual kembali tokennya." },
  blacklist: { label: "Address bisa diblokir", category: "contract", description: "Owner bisa memblokir address tertentu agar tidak bisa transfer." },
  upgradeable: { label: "Kode bisa diganti", category: "contract", description: "Kontrak proxy bisa diganti logikanya setelah deploy." },
  liquidity_unlocked: { label: "Likuiditas tidak terkunci", category: "liquidity", description: "LP token bisa ditarik pemiliknya kapan saja." },
  liquidity_pulled: { label: "Likuiditas ditarik", category: "liquidity", description: "Sebagian besar likuiditas sudah ditarik dari pool." },
  holder_concentration: { label: "Holder terkonsentrasi", category: "holders", description: "Segelintir wallet memegang sebagian besar supply." },
  bundled_launch: { label: "Pembelian terkoordinasi saat peluncuran", category: "holders", description: "Beberapa wallet didanai sumber sama dan membeli bersamaan." },
  fresh_wallet_funding: { label: "Mendanai wallet baru", category: "flow", description: "Dana dikirim ke wallet tanpa riwayat, pola umum sebelum peluncuran atau penyebaran dana." },
  exchange_cashout: { label: "Setoran ke exchange", category: "flow", description: "Dana dikirim ke deposit exchange; jejak berikutnya tidak terlihat on-chain." },
  bridge_hop: { label: "Pindah chain lewat bridge", category: "flow", description: "Dana dipindah ke chain lain, jejaknya perlu dilanjutkan di sana." },
};

/** Status ciri berbahaya; warnanya mengikuti nada risiko tinggi dan rendah. */
export const DANGER_STATUS_META: Record<DangerTraitStatus, { label: string; className: string }> = {
  detected: { label: "Terdeteksi", className: RISK_TONES.high.textClass },
  unknown: { label: "Belum bisa dicek", className: "text-muted" },
  clear: { label: "Tidak terdeteksi", className: RISK_TONES.low.textClass },
};

export const REPORT_STATUS_META: Record<ReportStatus, Meta & { description: string }> = {
  draft: {
    label: "Draf",
    description: "Masih disusun; isi bisa berubah.",
    className: "bg-slate-500/20 text-slate-300 ring-slate-400/30",
  },
  review: {
    label: "Ditinjau",
    description: "Sedang dicek ulang sebelum dibagikan.",
    className: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
  },
  final: {
    label: "Final",
    description: "Selesai disusun dari snapshot data yang tercatat.",
    className: "bg-teal-500/15 text-teal-300 ring-teal-400/30",
  },
};
