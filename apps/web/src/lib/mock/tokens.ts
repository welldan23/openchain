/**
 * Data tiruan halaman Token selama fase frontend.
 *
 * Semua token, address, dan hash di sini FIKTIF — dibuat agar UI bisa
 * diklik-klik sebelum backend tersedia. Jangan dipakai sebagai data nyata.
 */
import type { TokenHolder, TokenInvestigation } from "../types";
import {
  mockEvmAddress,
  mockEvmTxHash,
  mockSolanaAddress,
  mockSolanaSignature,
} from "./ids";

const SNAPSHOT_AT = "2026-10-03T04:30:00.000Z";

function holdersFromShares(
  supply: number,
  rows: Omit<TokenHolder, "rank" | "balance">[],
): TokenHolder[] {
  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    balance: Math.round((row.sharePct / 100) * supply),
  }));
}

/* -------------------------------------------------------------------------- */
/* Nebula Finance (NBLA) — Ethereum                                            */
/* -------------------------------------------------------------------------- */

const nbla = {
  token: mockEvmAddress("nbla:token"),
  deployer: mockEvmAddress("nbla:deployer"),
  pool: mockEvmAddress("nbla:univ2-pool"),
  funder: mockEvmAddress("nbla:common-funder"),
  bundler1: mockEvmAddress("nbla:bundler-1"),
  bundler2: mockEvmAddress("nbla:bundler-2"),
  holder3: mockEvmAddress("nbla:holder-3"),
  exchange: mockEvmAddress("nbla:exchange-hot"),
  whale: mockEvmAddress("nbla:whale"),
  treasury: mockEvmAddress("nbla:treasury"),
  buyerA: mockEvmAddress("nbla:buyer-a"),
  buyerB: mockEvmAddress("nbla:buyer-b"),
  burn: "0x000000000000000000000000000000000000dEaD",
  tx: {
    deploy: mockEvmTxHash("nbla:deploy"),
    addLiquidity: mockEvmTxHash("nbla:add-liquidity"),
    setTax: mockEvmTxHash("nbla:set-tax"),
    fundBundler1: mockEvmTxHash("nbla:fund-bundler-1"),
    fundBundler2: mockEvmTxHash("nbla:fund-bundler-2"),
    bundlerBuy: mockEvmTxHash("nbla:bundler-buy"),
    deployerFunding: mockEvmTxHash("nbla:deployer-funding"),
    transferHolder3: mockEvmTxHash("nbla:transfer-holder-3"),
    buy1: mockEvmTxHash("nbla:buy-1"),
    sell1: mockEvmTxHash("nbla:sell-1"),
    transfer1: mockEvmTxHash("nbla:transfer-1"),
    buy2: mockEvmTxHash("nbla:buy-2"),
    sell2: mockEvmTxHash("nbla:sell-2"),
    burn: mockEvmTxHash("nbla:burn"),
  },
};

const NBLA_SUPPLY = 1_000_000_000;
const NBLA_PRICE = 0.004213;

const nebulaFinance: TokenInvestigation = {
  token: {
    chain: "ethereum",
    address: nbla.token,
    name: "Nebula Finance",
    symbol: "NBLA",
    decimals: 18,
    totalSupply: NBLA_SUPPLY,
    deployer: nbla.deployer,
    deployedAt: "2026-09-12T08:14:00.000Z",
    deployTxHash: nbla.tx.deploy,
    verified: true,
  },
  market: {
    priceUsd: NBLA_PRICE,
    priceChange24hPct: 12.4,
    marketCapUsd: 4_213_000,
    fdvUsd: 4_213_000,
    liquidityUsd: 612_400,
    volume24hUsd: 1_843_000,
    holderCount: 3_482,
    txCount24h: 2_915,
  },
  risk: {
    score: 68,
    level: "high",
    findings: [
      {
        id: "nbla-owner-tax",
        title: "Owner masih bisa mengubah pajak transaksi",
        description:
          "Kontrak terverifikasi punya fungsi pengubah pajak yang hanya bisa dipanggil owner, dan kepemilikan belum di-renounce. Pajak jual terakhir dinaikkan dari 2% ke 5%.",
        severity: "high",
        classification: "fact",
        evidenceTxHashes: [nbla.tx.setTax],
      },
      {
        id: "nbla-concentration",
        title: "10 holder teratas menguasai 61,8% supply",
        description:
          "Dihitung dari saldo holder pada blok snapshot. Di luar pool likuiditas, 9 wallet masih memegang 43,4% supply.",
        severity: "high",
        classification: "calculation",
        evidenceTxHashes: [nbla.tx.transferHolder3],
      },
      {
        id: "nbla-common-funding",
        title: "Beberapa wallet dibiayai dari sumber yang sama sebelum peluncuran",
        description:
          "Lima wallet menerima ETH dari satu address dalam rentang 9 menit, lalu membeli NBLA di blok yang sama dengan penambahan likuiditas. Polanya mirip bundler, tapi belum pasti dioperasikan pihak yang sama.",
        severity: "medium",
        classification: "heuristic",
        evidenceTxHashes: [
          nbla.tx.fundBundler1,
          nbla.tx.fundBundler2,
          nbla.tx.bundlerBuy,
        ],
      },
      {
        id: "nbla-deployer-funding",
        title: "Deployer didanai dari hot wallet exchange",
        description:
          "Dana pertama deployer berasal dari address yang dilabeli sebagai hot wallet exchange oleh sumber label eksternal.",
        severity: "low",
        classification: "external_label",
        evidenceTxHashes: [nbla.tx.deployerFunding],
      },
      {
        id: "nbla-liquidity-lock",
        title: "Likuiditas diklaim terkunci 12 bulan",
        description:
          "Tim menyatakan LP token dikunci, tapi transaksi penguncian belum ditemukan di data on-chain. Anggap sebagai klaim sampai ada bukti.",
        severity: "medium",
        classification: "assumption",
        evidenceTxHashes: [],
      },
    ],
  },
  contract: {
    standard: "ERC-20",
    items: [
      {
        id: "verified",
        label: "Source code",
        status: "pass",
        value: "Terverifikasi di explorer",
        description: "Kode yang terverifikasi bisa dibaca dan diaudit siapa saja.",
        classification: "external_label",
        evidenceTxHashes: [],
      },
      {
        id: "ownership",
        label: "Kepemilikan kontrak",
        status: "warn",
        value: "Owner masih aktif, belum di-renounce",
        description: "Owner aktif masih bisa memanggil fungsi khusus owner kapan saja.",
        classification: "fact",
        evidenceTxHashes: [nbla.tx.deploy],
      },
      {
        id: "tax",
        label: "Pajak transaksi",
        status: "fail",
        value: "Beli 2% · Jual 5%, bisa diubah owner",
        description: "Owner bisa menaikkan pajak jual sampai membuat token sulit dijual.",
        classification: "fact",
        evidenceTxHashes: [nbla.tx.setTax],
      },
      {
        id: "blacklist",
        label: "Fungsi blacklist",
        status: "warn",
        value: "Ada, bisa dipanggil owner",
        description: "Address yang di-blacklist tidak bisa mentransfer atau menjual token.",
        classification: "fact",
        evidenceTxHashes: [],
      },
      {
        id: "proxy",
        label: "Kontrak proxy",
        status: "pass",
        value: "Bukan proxy, kode tidak bisa diganti",
        description: "Kontrak proxy bisa diganti logikanya setelah deploy.",
        classification: "fact",
        evidenceTxHashes: [],
      },
      {
        id: "mint",
        label: "Fungsi mint",
        status: "pass",
        value: "Tidak ada mint setelah deploy",
        description: "Fungsi mint memungkinkan supply baru dicetak dan menekan harga.",
        classification: "fact",
        evidenceTxHashes: [],
      },
      {
        id: "pause",
        label: "Pause transfer",
        status: "pass",
        value: "Tidak ada fungsi pause",
        description: "Fungsi pause bisa menghentikan semua transfer token.",
        classification: "fact",
        evidenceTxHashes: [],
      },
      {
        id: "liquidity-lock",
        label: "Kunci likuiditas",
        status: "warn",
        value: "Diklaim terkunci, transaksi kunci belum ditemukan",
        description: "LP yang tidak terkunci bisa ditarik kapan saja oleh pemiliknya.",
        classification: "assumption",
        evidenceTxHashes: [],
      },
      {
        id: "honeypot",
        label: "Simulasi jual",
        status: "unknown",
        value: "Belum disimulasikan",
        description: "Simulasi memastikan token benar-benar bisa dijual kembali.",
        evidenceTxHashes: [],
      },
    ],
  },
  holders: {
    concentration: { top10Pct: 61.8, top50Pct: 78.3, classification: "calculation" },
    top: holdersFromShares(NBLA_SUPPLY, [
      {
        address: nbla.pool,
        sharePct: 18.4,
        label: {
          type: "liquidity_pool",
          name: "Uniswap V2: NBLA/WETH",
          source: "external",
          sourceName: "Label publik explorer",
        },
      },
      {
        address: nbla.deployer,
        sharePct: 9.6,
        label: { type: "deployer", source: "heuristic", sourceName: "OpenChain heuristic" },
      },
      { address: nbla.holder3, sharePct: 7.2 },
      {
        address: nbla.bundler1,
        sharePct: 5.1,
        label: {
          type: "bot",
          name: "Kemungkinan bundler",
          source: "heuristic",
          sourceName: "OpenChain heuristic",
        },
      },
      {
        address: nbla.bundler2,
        sharePct: 4.9,
        label: {
          type: "bot",
          name: "Kemungkinan bundler",
          source: "heuristic",
          sourceName: "OpenChain heuristic",
        },
      },
      {
        address: nbla.treasury,
        sharePct: 4.6,
        label: { type: "treasury", source: "heuristic", sourceName: "OpenChain heuristic" },
      },
      {
        address: nbla.exchange,
        sharePct: 3.8,
        label: {
          type: "exchange",
          name: "Hot wallet exchange",
          source: "external",
          sourceName: "Label publik explorer",
        },
      },
      {
        address: nbla.whale,
        sharePct: 3.1,
        label: { type: "whale", source: "heuristic", sourceName: "OpenChain heuristic" },
      },
      { address: nbla.buyerA, sharePct: 2.7 },
      { address: nbla.buyerB, sharePct: 2.4 },
    ]),
  },
  activity: [
    {
      id: "nbla-act-1",
      type: "buy",
      txHash: nbla.tx.buy1,
      timestamp: "2026-10-03T04:26:11.000Z",
      from: nbla.pool,
      to: nbla.buyerA,
      amount: 1_250_000,
      amountUsd: 1_250_000 * NBLA_PRICE,
    },
    {
      id: "nbla-act-2",
      type: "sell",
      txHash: nbla.tx.sell1,
      timestamp: "2026-10-03T04:21:47.000Z",
      from: nbla.holder3,
      to: nbla.pool,
      amount: 3_400_000,
      amountUsd: 3_400_000 * NBLA_PRICE,
    },
    {
      id: "nbla-act-3",
      type: "transfer",
      txHash: nbla.tx.transfer1,
      timestamp: "2026-10-03T04:12:05.000Z",
      from: nbla.deployer,
      to: nbla.buyerB,
      amount: 5_000_000,
      amountUsd: 5_000_000 * NBLA_PRICE,
    },
    {
      id: "nbla-act-4",
      type: "buy",
      txHash: nbla.tx.buy2,
      timestamp: "2026-10-03T03:58:30.000Z",
      from: nbla.pool,
      to: nbla.whale,
      amount: 8_900_000,
      amountUsd: 8_900_000 * NBLA_PRICE,
    },
    {
      id: "nbla-act-5",
      type: "sell",
      txHash: nbla.tx.sell2,
      timestamp: "2026-10-03T03:40:12.000Z",
      from: nbla.bundler1,
      to: nbla.pool,
      amount: 6_100_000,
      amountUsd: 6_100_000 * NBLA_PRICE,
    },
    {
      id: "nbla-act-6",
      type: "burn",
      txHash: nbla.tx.burn,
      timestamp: "2026-10-03T02:15:00.000Z",
      from: nbla.treasury,
      to: nbla.burn,
      amount: 10_000_000,
      amountUsd: 10_000_000 * NBLA_PRICE,
    },
    {
      id: "nbla-act-7",
      type: "add_liquidity",
      txHash: nbla.tx.addLiquidity,
      timestamp: "2026-09-12T08:20:00.000Z",
      from: nbla.deployer,
      to: nbla.pool,
      amount: 200_000_000,
    },
    {
      id: "nbla-act-8",
      type: "deploy",
      txHash: nbla.tx.deploy,
      timestamp: "2026-09-12T08:14:00.000Z",
      from: nbla.deployer,
      to: nbla.token,
      amount: NBLA_SUPPLY,
    },
  ],
  evidence: [
    {
      txHash: nbla.tx.setTax,
      timestamp: "2026-09-28T10:05:00.000Z",
      summary: "Owner memanggil fungsi pengubah pajak dan menaikkan pajak jual dari 2% menjadi 5%.",
      classification: "fact",
      relatedFindingIds: ["nbla-owner-tax"],
    },
    {
      txHash: nbla.tx.transferHolder3,
      timestamp: "2026-09-12T09:02:00.000Z",
      summary: "Deployer mengirim 72 juta NBLA (7,2% supply) ke wallet yang kini menjadi holder #3.",
      classification: "fact",
      relatedFindingIds: ["nbla-concentration"],
    },
    {
      txHash: nbla.tx.fundBundler1,
      timestamp: "2026-09-12T08:05:00.000Z",
      summary: "Satu address funder mengirim 1,5 ETH ke wallet bundler pertama.",
      classification: "fact",
      relatedFindingIds: ["nbla-common-funding"],
    },
    {
      txHash: nbla.tx.fundBundler2,
      timestamp: "2026-09-12T08:09:00.000Z",
      summary: "Funder yang sama mengirim 1,5 ETH ke wallet bundler kedua, 4 menit kemudian.",
      classification: "fact",
      relatedFindingIds: ["nbla-common-funding"],
    },
    {
      txHash: nbla.tx.bundlerBuy,
      timestamp: "2026-09-12T08:20:00.000Z",
      summary: "Wallet bundler membeli 51 juta NBLA di blok yang sama dengan penambahan likuiditas.",
      classification: "fact",
      relatedFindingIds: ["nbla-common-funding"],
    },
    {
      txHash: nbla.tx.deployerFunding,
      timestamp: "2026-09-11T22:40:00.000Z",
      summary: "Deployer menerima 3 ETH dari address berlabel hot wallet exchange.",
      classification: "external_label",
      relatedFindingIds: ["nbla-deployer-funding"],
    },
  ],
  snapshot: {
    fetchedAt: SNAPSHOT_AT,
    blockNumber: 23_512_880,
    sources: ["Node RPC (tiruan)", "DEX indexer (tiruan)", "Label publik explorer (tiruan)"],
  },
};

/* -------------------------------------------------------------------------- */
/* Kodo Cat (KODO) — Solana                                                    */
/* -------------------------------------------------------------------------- */

const kodo = {
  mint: mockSolanaAddress("kodo:mint"),
  creator: mockSolanaAddress("kodo:creator"),
  pool: mockSolanaAddress("kodo:raydium-pool"),
  bundler1: mockSolanaAddress("kodo:bundler-1"),
  bundler2: mockSolanaAddress("kodo:bundler-2"),
  bundler3: mockSolanaAddress("kodo:bundler-3"),
  sniper: mockSolanaAddress("kodo:sniper"),
  whale: mockSolanaAddress("kodo:whale"),
  holderA: mockSolanaAddress("kodo:holder-a"),
  holderB: mockSolanaAddress("kodo:holder-b"),
  holderC: mockSolanaAddress("kodo:holder-c"),
  buyer: mockSolanaAddress("kodo:buyer"),
  tx: {
    createMint: mockSolanaSignature("kodo:create-mint"),
    createPool: mockSolanaSignature("kodo:create-pool"),
    bundleBuy1: mockSolanaSignature("kodo:bundle-buy-1"),
    bundleBuy2: mockSolanaSignature("kodo:bundle-buy-2"),
    bundleBuy3: mockSolanaSignature("kodo:bundle-buy-3"),
    buy1: mockSolanaSignature("kodo:buy-1"),
    sell1: mockSolanaSignature("kodo:sell-1"),
    sell2: mockSolanaSignature("kodo:sell-2"),
    transfer1: mockSolanaSignature("kodo:transfer-1"),
    removeLiquidity: mockSolanaSignature("kodo:remove-liquidity"),
  },
};

const KODO_SUPPLY = 999_850_000;
const KODO_PRICE = 0.00008731;

const kodoCat: TokenInvestigation = {
  token: {
    chain: "solana",
    address: kodo.mint,
    name: "Kodo Cat",
    symbol: "KODO",
    decimals: 6,
    totalSupply: KODO_SUPPLY,
    deployer: kodo.creator,
    deployedAt: "2026-10-01T13:02:00.000Z",
    deployTxHash: kodo.tx.createMint,
    verified: false,
  },
  market: {
    priceUsd: KODO_PRICE,
    priceChange24hPct: -8.7,
    marketCapUsd: 87_300,
    fdvUsd: 87_300,
    liquidityUsd: 21_400,
    volume24hUsd: 312_000,
    holderCount: 1_207,
    txCount24h: 4_388,
  },
  risk: {
    score: 82,
    level: "critical",
    findings: [
      {
        id: "kodo-mint-authority",
        title: "Mint authority masih aktif",
        description:
          "Mint authority belum dicabut, jadi pembuat token masih bisa mencetak supply baru kapan saja.",
        severity: "critical",
        classification: "fact",
        evidenceTxHashes: [kodo.tx.createMint],
      },
      {
        id: "kodo-bundle",
        title: "Pembelian ter-bundle di slot peluncuran",
        description:
          "12 wallet membeli di slot yang sama dengan pembuatan pool dan kini memegang 23,4% supply. Polanya cocok dengan bundler, tapi tetap estimasi.",
        severity: "high",
        classification: "heuristic",
        evidenceTxHashes: [kodo.tx.bundleBuy1, kodo.tx.bundleBuy2, kodo.tx.bundleBuy3],
      },
      {
        id: "kodo-concentration",
        title: "10 holder teratas menguasai 48,9% supply",
        description:
          "Dihitung dari saldo pada slot snapshot. Di luar pool likuiditas, 9 wallet memegang 34,7% supply.",
        severity: "medium",
        classification: "calculation",
        evidenceTxHashes: [],
      },
      {
        id: "kodo-liquidity-pull",
        title: "Sebagian likuiditas sudah ditarik pembuat token",
        description:
          "Pembuat token menarik likuiditas dari pool sekitar 31 jam setelah peluncuran.",
        severity: "high",
        classification: "fact",
        evidenceTxHashes: [kodo.tx.removeLiquidity],
      },
      {
        id: "kodo-social",
        title: "Akun media sosial diasumsikan milik pembuat token",
        description:
          "Belum ada tanda tangan atau tautan on-chain yang membuktikan akun media sosial ini dikelola pembuat token.",
        severity: "low",
        classification: "assumption",
        evidenceTxHashes: [],
      },
    ],
  },
  contract: {
    standard: "SPL Token",
    items: [
      {
        id: "mint-authority",
        label: "Mint authority",
        status: "fail",
        value: "Aktif, pembuat bisa mencetak supply baru",
        description: "Supply baru bisa dicetak kapan saja dan menekan harga.",
        classification: "fact",
        evidenceTxHashes: [kodo.tx.createMint],
      },
      {
        id: "freeze-authority",
        label: "Freeze authority",
        status: "pass",
        value: "Sudah dicabut",
        description: "Freeze authority aktif bisa membekukan saldo token milik holder.",
        classification: "fact",
        evidenceTxHashes: [kodo.tx.createMint],
      },
      {
        id: "metadata",
        label: "Metadata token",
        status: "warn",
        value: "Masih bisa diubah update authority",
        description: "Nama, simbol, dan logo token bisa diganti setelah peluncuran.",
        classification: "fact",
        evidenceTxHashes: [],
      },
      {
        id: "token-2022",
        label: "Ekstensi Token-2022",
        status: "pass",
        value: "Tidak ada, token SPL standar",
        description: "Ekstensi seperti transfer fee atau permanent delegate bisa membatasi holder.",
        classification: "fact",
        evidenceTxHashes: [],
      },
      {
        id: "liquidity",
        label: "Likuiditas",
        status: "fail",
        value: "Sebagian LP sudah ditarik pembuat token",
        description: "Penarikan likuiditas oleh pembuat token sering mendahului rug pull.",
        classification: "fact",
        evidenceTxHashes: [kodo.tx.removeLiquidity],
      },
      {
        id: "honeypot",
        label: "Simulasi jual",
        status: "unknown",
        value: "Belum disimulasikan",
        description: "Simulasi memastikan token benar-benar bisa dijual kembali.",
        evidenceTxHashes: [],
      },
    ],
  },
  holders: {
    concentration: { top10Pct: 48.9, top50Pct: 67.5, classification: "calculation" },
    top: holdersFromShares(KODO_SUPPLY, [
      {
        address: kodo.pool,
        sharePct: 14.2,
        label: {
          type: "liquidity_pool",
          name: "Raydium: KODO/SOL",
          source: "external",
          sourceName: "Label publik explorer",
        },
      },
      {
        address: kodo.bundler1,
        sharePct: 8.1,
        label: {
          type: "bot",
          name: "Kemungkinan bundler",
          source: "heuristic",
          sourceName: "OpenChain heuristic",
        },
      },
      {
        address: kodo.bundler2,
        sharePct: 5.6,
        label: {
          type: "bot",
          name: "Kemungkinan bundler",
          source: "heuristic",
          sourceName: "OpenChain heuristic",
        },
      },
      {
        address: kodo.creator,
        sharePct: 4.3,
        label: { type: "deployer", source: "heuristic", sourceName: "OpenChain heuristic" },
      },
      {
        address: kodo.bundler3,
        sharePct: 3.9,
        label: {
          type: "bot",
          name: "Kemungkinan bundler",
          source: "heuristic",
          sourceName: "OpenChain heuristic",
        },
      },
      {
        address: kodo.sniper,
        sharePct: 3.4,
        label: {
          type: "bot",
          name: "Sniper bot",
          source: "heuristic",
          sourceName: "OpenChain heuristic",
        },
      },
      {
        address: kodo.whale,
        sharePct: 2.9,
        label: { type: "whale", source: "heuristic", sourceName: "OpenChain heuristic" },
      },
      { address: kodo.holderA, sharePct: 2.4 },
      { address: kodo.holderB, sharePct: 2.2 },
      { address: kodo.holderC, sharePct: 1.9 },
    ]),
  },
  activity: [
    {
      id: "kodo-act-1",
      type: "sell",
      txHash: kodo.tx.sell1,
      timestamp: "2026-10-03T04:28:40.000Z",
      from: kodo.bundler1,
      to: kodo.pool,
      amount: 12_500_000,
      amountUsd: 12_500_000 * KODO_PRICE,
    },
    {
      id: "kodo-act-2",
      type: "buy",
      txHash: kodo.tx.buy1,
      timestamp: "2026-10-03T04:24:02.000Z",
      from: kodo.pool,
      to: kodo.buyer,
      amount: 4_800_000,
      amountUsd: 4_800_000 * KODO_PRICE,
    },
    {
      id: "kodo-act-3",
      type: "sell",
      txHash: kodo.tx.sell2,
      timestamp: "2026-10-03T04:05:19.000Z",
      from: kodo.sniper,
      to: kodo.pool,
      amount: 9_200_000,
      amountUsd: 9_200_000 * KODO_PRICE,
    },
    {
      id: "kodo-act-4",
      type: "transfer",
      txHash: kodo.tx.transfer1,
      timestamp: "2026-10-03T03:47:55.000Z",
      from: kodo.bundler2,
      to: kodo.holderA,
      amount: 20_000_000,
      amountUsd: 20_000_000 * KODO_PRICE,
    },
    {
      id: "kodo-act-5",
      type: "remove_liquidity",
      txHash: kodo.tx.removeLiquidity,
      timestamp: "2026-10-02T20:10:00.000Z",
      from: kodo.pool,
      to: kodo.creator,
      amount: 95_000_000,
      amountUsd: 95_000_000 * KODO_PRICE,
    },
    {
      id: "kodo-act-6",
      type: "buy",
      txHash: kodo.tx.bundleBuy1,
      timestamp: "2026-10-01T13:05:12.000Z",
      from: kodo.pool,
      to: kodo.bundler1,
      amount: 81_000_000,
    },
    {
      id: "kodo-act-7",
      type: "add_liquidity",
      txHash: kodo.tx.createPool,
      timestamp: "2026-10-01T13:05:12.000Z",
      from: kodo.creator,
      to: kodo.pool,
      amount: 300_000_000,
    },
    {
      id: "kodo-act-8",
      type: "mint",
      txHash: kodo.tx.createMint,
      timestamp: "2026-10-01T13:02:00.000Z",
      from: kodo.creator,
      to: kodo.creator,
      amount: KODO_SUPPLY,
    },
  ],
  evidence: [
    {
      txHash: kodo.tx.createMint,
      timestamp: "2026-10-01T13:02:00.000Z",
      summary: "Token dibuat dengan mint authority tetap di tangan pembuat dan tidak pernah dicabut.",
      classification: "fact",
      relatedFindingIds: ["kodo-mint-authority"],
    },
    {
      txHash: kodo.tx.bundleBuy1,
      timestamp: "2026-10-01T13:05:12.000Z",
      summary: "Wallet bundler pertama membeli 81 juta KODO di slot pembuatan pool.",
      classification: "fact",
      relatedFindingIds: ["kodo-bundle"],
    },
    {
      txHash: kodo.tx.bundleBuy2,
      timestamp: "2026-10-01T13:05:12.000Z",
      summary: "Wallet bundler kedua membeli 56 juta KODO di slot yang sama.",
      classification: "fact",
      relatedFindingIds: ["kodo-bundle"],
    },
    {
      txHash: kodo.tx.bundleBuy3,
      timestamp: "2026-10-01T13:05:12.000Z",
      summary: "Wallet bundler ketiga membeli 39 juta KODO di slot yang sama.",
      classification: "fact",
      relatedFindingIds: ["kodo-bundle"],
    },
    {
      txHash: kodo.tx.removeLiquidity,
      timestamp: "2026-10-02T20:10:00.000Z",
      summary: "Pembuat token menarik 95 juta KODO dan SOL pasangannya dari pool Raydium.",
      classification: "fact",
      relatedFindingIds: ["kodo-liquidity-pull"],
    },
  ],
  snapshot: {
    fetchedAt: SNAPSHOT_AT,
    blockNumber: 371_204_551,
    sources: ["Node RPC (tiruan)", "DEX indexer (tiruan)", "Label publik explorer (tiruan)"],
  },
};

/* -------------------------------------------------------------------------- */
/* Sunyi Protocol (SUNY) — Base, token baru tanpa data (contoh status kosong)  */
/* -------------------------------------------------------------------------- */

const suny = {
  token: mockEvmAddress("suny:token"),
  deployer: mockEvmAddress("suny:deployer"),
  deployTx: mockEvmTxHash("suny:deploy"),
};

const sunyiProtocol: TokenInvestigation = {
  token: {
    chain: "base",
    address: suny.token,
    name: "Sunyi Protocol",
    symbol: "SUNY",
    decimals: 18,
    totalSupply: 500_000_000,
    deployer: suny.deployer,
    deployedAt: "2026-10-03T04:18:00.000Z",
    deployTxHash: suny.deployTx,
    verified: false,
  },
  market: {
    priceUsd: 0,
    priceChange24hPct: 0,
    marketCapUsd: 0,
    fdvUsd: 0,
    liquidityUsd: 0,
    volume24hUsd: 0,
    holderCount: 0,
    txCount24h: 0,
  },
  risk: { score: 0, level: "unknown", findings: [] },
  contract: { standard: "ERC-20", items: [] },
  holders: {
    concentration: { top10Pct: 0, top50Pct: 0, classification: "calculation" },
    top: [],
  },
  activity: [],
  evidence: [],
  snapshot: {
    fetchedAt: SNAPSHOT_AT,
    blockNumber: 36_118_402,
    sources: ["Node RPC (tiruan)"],
  },
};

export const MOCK_TOKENS: TokenInvestigation[] = [nebulaFinance, kodoCat, sunyiProtocol];

/**
 * Address yang sengaja membuat API tiruan gagal, untuk mencoba tampilan
 * status gagal di halaman Token.
 */
export const MOCK_FAILING_TOKEN = {
  chain: "arbitrum",
  address: mockEvmAddress("demo:gagal-dimuat"),
} as const;
