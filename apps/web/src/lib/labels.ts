import type {
  ActivityType,
  ClusterConfidence,
  ClusterLabel,
  CoordinationKind,
  CoordinationTxAction,
  ContractCheckStatus,
  EntityLabelType,
  FindingClassification,
  FlowDirection,
  RiskLevel,
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

export const CLASSIFICATION_META: Record<
  FindingClassification,
  Meta & { description: string }
> = {
  fact: {
    label: "Fakta on-chain",
    description: "Tercatat langsung di blockchain dan bisa dicek lewat hash transaksi.",
    className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  },
  calculation: {
    label: "Kalkulasi",
    description: "Hasil hitungan dari data on-chain pada waktu snapshot.",
    className: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
  },
  heuristic: {
    label: "Heuristic",
    description: "Dugaan berbasis pola. Selalu estimasi, bukan kepastian.",
    className: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  },
  external_label: {
    label: "Label eksternal",
    description: "Berasal dari sumber pihak ketiga, bukan hasil analisis internal.",
    className: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
  },
  assumption: {
    label: "Asumsi",
    description: "Belum terverifikasi on-chain. Perlakukan sebagai klaim.",
    className: "bg-slate-500/20 text-slate-300 ring-slate-400/30",
  },
};

export const SEVERITY_META: Record<RiskSeverity, Meta> = {
  critical: { label: "Kritis", className: "bg-rose-500/15 text-rose-300 ring-rose-400/40" },
  high: { label: "Tinggi", className: "bg-orange-500/15 text-orange-300 ring-orange-400/40" },
  medium: { label: "Sedang", className: "bg-amber-500/15 text-amber-300 ring-amber-400/40" },
  low: { label: "Rendah", className: "bg-lime-500/15 text-lime-300 ring-lime-400/40" },
  info: { label: "Info", className: "bg-slate-500/20 text-slate-300 ring-slate-400/30" },
};

export const RISK_LEVEL_META: Record<RiskLevel, Meta & { barClass: string }> = {
  unknown: {
    label: "Belum dinilai",
    className: "bg-slate-500/20 text-slate-300 ring-slate-400/30",
    barClass: "bg-slate-400",
  },
  low: {
    label: "Risiko rendah",
    className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
    barClass: "bg-emerald-400",
  },
  medium: {
    label: "Risiko sedang",
    className: "bg-amber-500/15 text-amber-300 ring-amber-400/40",
    barClass: "bg-amber-400",
  },
  high: {
    label: "Risiko tinggi",
    className: "bg-orange-500/15 text-orange-300 ring-orange-400/40",
    barClass: "bg-orange-400",
  },
  critical: {
    label: "Risiko kritis",
    className: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
    barClass: "bg-rose-400",
  },
};

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
