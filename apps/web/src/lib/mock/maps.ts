/**
 * Data tiruan halaman Peta Hubungan Wallet selama fase frontend.
 *
 * Gelembung diambil dari holder di `mock/tokens.ts` dan garis dari transfer di
 * `mock/flows.ts`, jadi peta, halaman token, dan aliran dana saling cocok.
 * Semua nilai FIKTIF.
 */
import type {
  AddressFlow,
  CoordinationEvent,
  CoordinationTx,
  CoordinationTxAction,
  EntityLabel,
  MapCluster,
  MapEdge,
  MapNode,
  TokenInvestigation,
  WalletMap,
} from "../types";
import { MOCK_FLOWS } from "./flows";
import { mockEvmAddress, mockEvmTxHash, mockSolanaAddress, mockSolanaSignature } from "./ids";
import { MOCK_TOKENS } from "./tokens";

const BUNDLER_LABEL: EntityLabel = {
  type: "bot",
  name: "Kemungkinan bundler",
  source: "heuristic",
  sourceName: "OpenChain heuristic",
};

function tokenBySymbol(symbol: string): TokenInvestigation {
  const token = MOCK_TOKENS.find((item) => item.token.symbol === symbol);
  if (!token) throw new Error(`Data tiruan token ${symbol} tidak ada.`);
  return token;
}

function flowsOn(chain: WalletMap["chain"]): AddressFlow[] {
  return MOCK_FLOWS.filter((flow) => flow.chain === chain);
}

/** Holder teratas token sebagai gelembung; pool likuiditas ditandai kontrak. */
function holderNodes(token: TokenInvestigation): MapNode[] {
  return token.holders.top.map((holder) => ({
    address: holder.address,
    label: holder.label,
    sharePct: holder.sharePct,
    isContract: holder.label?.type === "liquidity_pool",
  }));
}

/**
 * Garis dari transfer di data aliran dana, hanya yang kedua ujungnya ada di
 * peta. Transfer yang sama dari dua sisi (masuk di satu wallet, keluar di
 * wallet lain) cukup satu garis.
 */
function edgesFromFlows(flows: AddressFlow[], nodes: MapNode[]): MapEdge[] {
  const onMap = new Set(nodes.map((node) => node.address));
  const edges = new Map<string, MapEdge>();
  for (const flow of flows) {
    for (const transfer of flow.transfers) {
      const [from, to] =
        transfer.direction === "in" ? [transfer.counterparty, flow.address] : [flow.address, transfer.counterparty];
      if (!onMap.has(from) || !onMap.has(to)) continue;
      const id = `${transfer.txHash}:${from}:${to}:${transfer.asset.symbol}`;
      edges.set(id, {
        id,
        from,
        to,
        kind: transfer.asset.address === null ? "funding" : "token_transfer",
        asset: transfer.asset,
        amount: transfer.amount,
        amountUsd: transfer.amountUsd,
        txHash: transfer.txHash,
        timestamp: transfer.timestamp,
      });
    }
  }
  return [...edges.values()];
}

/** Hash transaksi garis dari `from` ke `to`; daftar kosong bila tidak ada garisnya. */
function txBetween(edges: MapEdge[], pairs: Array<[string, string]>): string[] {
  return pairs.flatMap(([from, to]) => edges.filter((edge) => edge.from === from && edge.to === to).map((edge) => edge.txHash));
}

/** Blok/slot patokan dan lama per blok, untuk memperkirakan nomor blok transaksi tiruan. */
const BLOCK_CLOCK = {
  ethereum: { block: 23_271_904, at: Date.parse("2026-09-12T08:31:00.000Z"), seconds: 12 },
  solana: { block: 371_002_118, at: Date.parse("2026-09-28T03:41:00.000Z"), seconds: 0.4 },
} as const;

function blockAt(chain: keyof typeof BLOCK_CLOCK, timestamp: string): number {
  const clock = BLOCK_CLOCK[chain];
  return clock.block + Math.round((Date.parse(timestamp) - clock.at) / 1000 / clock.seconds);
}

/** Transaksi pendukung dari garis peta antara pasangan wallet. */
function txsFromEdges(
  chain: keyof typeof BLOCK_CLOCK,
  edges: MapEdge[],
  pairs: Array<[string, string]>,
  action: CoordinationTxAction,
): CoordinationTx[] {
  return pairs.flatMap(([from, to]) =>
    edges
      .filter((edge) => edge.from === from && edge.to === to)
      .map((edge) => ({
        txHash: edge.txHash,
        timestamp: edge.timestamp,
        blockNumber: blockAt(chain, edge.timestamp),
        action,
        from: edge.from,
        to: edge.to,
        asset: edge.asset,
        amount: edge.amount,
        amountUsd: edge.amountUsd,
      })),
  );
}

function withClusters(nodes: MapNode[], members: Record<string, string[]>): MapNode[] {
  const clusterOf = new Map(Object.entries(members).flatMap(([id, addresses]) => addresses.map((a) => [a, id])));
  return nodes.map((node) => {
    const clusterId = clusterOf.get(node.address);
    return clusterId ? { ...node, clusterId } : node;
  });
}

/* -------------------------------------------------------------------------- */
/* Nebula Finance (NBLA) — Ethereum                                            */
/* -------------------------------------------------------------------------- */

const nblaToken = tokenBySymbol("NBLA");
const nbla = {
  funder: mockEvmAddress("nbla:common-funder"),
  deployer: mockEvmAddress("nbla:deployer"),
  treasury: mockEvmAddress("nbla:treasury"),
  holder3: mockEvmAddress("nbla:holder-3"),
  bundlers: [
    mockEvmAddress("nbla:bundler-1"),
    mockEvmAddress("nbla:bundler-2"),
    mockEvmAddress("flow:nbla-bundler-3"),
    mockEvmAddress("flow:nbla-bundler-4"),
    mockEvmAddress("flow:nbla-bundler-5"),
  ],
};

const nblaNodes: MapNode[] = [
  ...holderNodes(nblaToken),
  // Bundler #3–5 ada di peringkat 11–50, pendananya tidak memegang NBLA.
  { address: nbla.bundlers[2], label: BUNDLER_LABEL, sharePct: 1.8, isContract: false },
  { address: nbla.bundlers[3], label: BUNDLER_LABEL, sharePct: 1.6, isContract: false },
  { address: nbla.bundlers[4], label: BUNDLER_LABEL, sharePct: 1.5, isContract: false },
  {
    address: nbla.funder,
    label: { type: "unknown", name: "Pendana bersama 5 wallet", source: "heuristic", sourceName: "OpenChain heuristic" },
    sharePct: 0,
    isContract: false,
  },
];

const nblaEdges = edgesFromFlows(flowsOn("ethereum"), nblaNodes);
const nblaExchange = mockEvmAddress("nbla:exchange-hot");

const nblaClusters: MapCluster[] = [
  {
    id: "nbla-pendana-bersama",
    name: "Pendana bersama",
    reason:
      "Lima wallet menerima ETH dari satu pendana dalam 9 menit, lalu membeli NBLA di blok yang sama dengan penambahan likuiditas. Dua di antaranya mengembalikan ETH ke pendana setelah menjual.",
    labels: ["common_funding", "bundled_or_sniper_activity"],
    confidence: "medium",
    signals: [
      {
        id: "common-funder",
        label: "Pendana langsung yang sama",
        detail: "Kelima wallet menerima modal ETH pertama dari address yang sama.",
        matched: true,
        evidenceTxHashes: txBetween(nblaEdges, nbla.bundlers.map((bundler): [string, string] => [nbla.funder, bundler])),
      },
      {
        id: "funding-window",
        label: "Didanai dalam waktu berdekatan",
        detail: "Semua pendanaan terjadi dalam rentang 9 menit.",
        matched: true,
        evidenceTxHashes: [],
      },
      {
        id: "same-block-buy",
        label: "Beli di blok yang sama dengan penambahan likuiditas",
        detail: "Pembelian pertama kelima wallet ada di blok penambahan likuiditas.",
        matched: true,
        evidenceTxHashes: [mockEvmTxHash("nbla:bundler-buy")],
      },
      {
        id: "consolidation",
        label: "Dana kembali ke pendana",
        detail: "Dua wallet mengirim ETH kembali ke pendana setelah menjual, satu mengirim NBLA.",
        matched: true,
        evidenceTxHashes: txBetween(nblaEdges, nbla.bundlers.slice(0, 3).map((bundler): [string, string] => [bundler, nbla.funder])),
      },
      {
        id: "exchange-source",
        label: "Sumber dana dari exchange",
        detail: "Pendana mendapat ETH dari hot wallet exchange, jadi asal dana sebelum itu tidak bisa dilacak lebih jauh.",
        matched: false,
        evidenceTxHashes: txBetween(nblaEdges, [[nblaExchange, nbla.funder]]),
      },
    ],
    caveats: [
      "Pendana bersama belum tentu pemilik yang sama; bisa juga layanan yang mendanai banyak pengguna.",
      "Tiga dari lima wallet belum mengembalikan dana, jadi pola konsolidasi belum lengkap.",
    ],
  },
  {
    id: "nbla-lingkaran-deployer",
    name: "Lingkaran deployer",
    reason: "Menerima NBLA langsung dari deployer, sebelum dan sesudah likuiditas ditambahkan.",
    labels: ["likely_linked", "false_positive_possible"],
    confidence: "low",
    signals: [
      {
        id: "deployer-allocation",
        label: "Menerima token langsung dari deployer",
        detail: "Treasury dan satu holder menerima NBLA langsung dari deployer.",
        matched: true,
        evidenceTxHashes: txBetween(nblaEdges, [
          [nbla.deployer, nbla.treasury],
          [nbla.deployer, nbla.holder3],
        ]),
      },
      {
        id: "common-funder",
        label: "Pendana langsung yang sama",
        detail: "Tidak ada pendana ETH bersama di antara anggota.",
        matched: false,
        evidenceTxHashes: [],
      },
      {
        id: "coordinated-sell",
        label: "Jual terkoordinasi",
        detail: "Belum ada penjualan bersamaan dari anggota kelompok ini.",
        matched: false,
        evidenceTxHashes: [],
      },
    ],
    caveats: [
      "Penerima token dari deployer bisa juga mitra, alokasi marketing, atau airdrop yang sah. Tidak cukup bukti untuk menyebutnya tim atau orang dalam.",
    ],
  },
];

const nblaFundingTxs = txsFromEdges(
  "ethereum",
  nblaEdges,
  nbla.bundlers.map((bundler): [string, string] => [nbla.funder, bundler]),
  "funding",
);
const NBLA_LAUNCH_PRICE = 0.0000306;
const nblaLaunch = { timestamp: "2026-09-12T08:31:00.000Z", blockNumber: BLOCK_CLOCK.ethereum.block };
const nblaPool = mockEvmAddress("nbla:univ2-pool");
const nblaAsset = { symbol: "NBLA", address: nblaToken.token.address };
/** Pembelian pertama tiap bundler di blok penambahan likuiditas (juta NBLA). */
const nblaLaunchBuys: CoordinationTx[] = [51, 49, 18, 16, 15].map((millions, index) => ({
  txHash: index === 0 ? mockEvmTxHash("nbla:bundler-buy") : mockEvmTxHash(`flow:nbla-bundler-buy-${index + 1}`),
  ...nblaLaunch,
  action: "buy",
  from: nblaPool,
  to: nbla.bundlers[index],
  asset: nblaAsset,
  amount: millions * 1_000_000,
  amountUsd: millions * 1_000_000 * NBLA_LAUNCH_PRICE,
}));

const nblaCoordination: CoordinationEvent[] = [
  {
    id: "nbla-same-block-buy",
    kind: "same_block_buy",
    detail: "Kelima wallet membeli NBLA di blok yang sama dengan penambahan likuiditas.",
    members: nbla.bundlers,
    confidence: "high",
    timestamp: "2026-09-12T08:31:00.000Z",
    windowSeconds: 0,
    blockNumber: BLOCK_CLOCK.ethereum.block,
    transactions: [
      ...txsFromEdges("ethereum", nblaEdges, [[nbla.deployer, nblaPool]], "add_liquidity"),
      ...nblaLaunchBuys,
    ],
  },
  {
    id: "nbla-funding-burst",
    kind: "funding_burst",
    detail: "Pendana mengirim ETH ke lima wallet dalam 9 menit, tepat sebelum likuiditas ditambahkan.",
    members: [nbla.funder, ...nbla.bundlers],
    confidence: "medium",
    timestamp: "2026-09-12T07:58:00.000Z",
    windowSeconds: 9 * 60,
    transactions: nblaFundingTxs,
  },
  {
    id: "nbla-similar-amount",
    kind: "similar_amount",
    detail: "Kiriman ETH ke kelima wallet antara 1,95 dan 2,2 ETH (selisih kurang dari 13%).",
    members: nbla.bundlers,
    confidence: "low",
    timestamp: "2026-09-12T07:58:00.000Z",
    windowSeconds: 9 * 60,
    transactions: nblaFundingTxs,
  },
];

const nblaMap: WalletMap = {
  chain: "ethereum",
  token: { address: nblaToken.token.address, name: nblaToken.token.name, symbol: nblaToken.token.symbol },
  nodes: withClusters(nblaNodes, {
    "nbla-pendana-bersama": [nbla.funder, ...nbla.bundlers],
    "nbla-lingkaran-deployer": [nbla.deployer, nbla.treasury, nbla.holder3],
  }),
  edges: nblaEdges,
  clusters: nblaClusters,
  coordination: nblaCoordination,
  snapshot: nblaToken.snapshot,
};

/* -------------------------------------------------------------------------- */
/* Kodo Cat (KODO) — Solana                                                    */
/* -------------------------------------------------------------------------- */

const kodoToken = tokenBySymbol("KODO");
const kodo = {
  creator: mockSolanaAddress("kodo:creator"),
  exchange: mockSolanaAddress("flow:kodo-exchange-hot"),
  bundlers: [mockSolanaAddress("kodo:bundler-1"), mockSolanaAddress("kodo:bundler-2"), mockSolanaAddress("kodo:bundler-3")],
};

const kodoNodes: MapNode[] = [
  ...holderNodes(kodoToken),
  {
    address: kodo.exchange,
    label: { type: "exchange", name: "Hot wallet exchange", source: "external", sourceName: "Label publik explorer" },
    sharePct: 0,
    isContract: false,
  },
];

const kodoEdges = edgesFromFlows(flowsOn("solana"), kodoNodes);

const kodoMap: WalletMap = {
  chain: "solana",
  token: { address: kodoToken.token.address, name: kodoToken.token.name, symbol: kodoToken.token.symbol },
  nodes: withClusters(kodoNodes, { "kodo-pembuat-bundler": [kodo.creator, ...kodo.bundlers] }),
  edges: kodoEdges,
  clusters: [
    {
      id: "kodo-pembuat-bundler",
      name: "Pembuat & bundler",
      reason: "Tiga wallet bundler menerima SOL dari pembuat token dalam 2 menit, sebelum token diluncurkan.",
      labels: ["common_funding", "insider_or_team"],
      confidence: "high",
      signals: [
        {
          id: "creator-funding",
          label: "Didanai langsung oleh pembuat token",
          detail: "Ketiga wallet menerima SOL langsung dari wallet yang membuat token.",
          matched: true,
          evidenceTxHashes: txBetween(kodoEdges, kodo.bundlers.map((bundler): [string, string] => [kodo.creator, bundler])),
        },
        {
          id: "funding-window",
          label: "Didanai dalam waktu berdekatan",
          detail: "Semua pendanaan terjadi dalam rentang 2 menit, sebelum peluncuran.",
          matched: true,
          evidenceTxHashes: [],
        },
        {
          id: "consolidation",
          label: "Dana kembali ke pembuat",
          detail: "Belum ada dana yang kembali ke pembuat token.",
          matched: false,
          evidenceTxHashes: [],
        },
      ],
      caveats: ["Pendanaan langsung dari pembuat adalah bukti kuat keterkaitan, tapi belum membuktikan niat menjual bersama."],
    },
  ],
  coordination: [
    {
      id: "kodo-funding-burst",
      kind: "funding_burst",
      detail: "Pembuat token mengirim SOL ke tiga wallet dalam 2 menit, sebelum token diluncurkan.",
      members: [kodo.creator, ...kodo.bundlers],
      confidence: "high",
      timestamp: "2026-09-28T03:20:00.000Z",
      windowSeconds: 2 * 60,
      transactions: txsFromEdges(
        "solana",
        kodoEdges,
        kodo.bundlers.map((bundler): [string, string] => [kodo.creator, bundler]),
        "funding",
      ),
    },
    {
      id: "kodo-same-slot-buy",
      kind: "same_block_buy",
      detail: "Ketiga wallet membeli KODO di slot peluncuran.",
      members: kodo.bundlers,
      confidence: "medium",
      timestamp: "2026-09-28T03:41:00.000Z",
      windowSeconds: 0,
      blockNumber: BLOCK_CLOCK.solana.block,
      // Porsi awal bundler (8,1%, 5,6%, 3,9% supply) dibeli di slot peluncuran.
      transactions: [81, 56, 39].map((share, index) => ({
        txHash: mockSolanaSignature(`kodo:bundle-buy-${index + 1}`),
        timestamp: "2026-09-28T03:41:00.000Z",
        blockNumber: BLOCK_CLOCK.solana.block,
        action: "buy" as const,
        from: mockSolanaAddress("kodo:raydium-pool"),
        to: kodo.bundlers[index],
        asset: { symbol: "KODO", address: kodoToken.token.address },
        amount: Math.round((share / 1000) * kodoToken.token.totalSupply),
        amountUsd: Math.round((share / 1000) * kodoToken.token.totalSupply) * 0.0000412,
      })),
    },
  ],
  snapshot: kodoToken.snapshot,
};

export const MOCK_MAPS: WalletMap[] = [nblaMap, kodoMap];

/**
 * Token yang sengaja membuat API tiruan gagal, untuk mencoba tampilan status
 * gagal di halaman peta.
 */
export const MOCK_FAILING_MAP = {
  chain: "arbitrum",
  address: mockEvmAddress("demo:peta-gagal-dimuat"),
} as const;
