/**
 * Indeks pencarian dan riwayat investigasi tiruan selama fase frontend.
 * Dibangun dari data tiruan halaman lain, jadi setiap hasil membuka halaman
 * yang memang ada. Semua nilai FIKTIF.
 */
import { flowPath } from "../api/flows";
import { mapPath } from "../api/maps";
import { multichainPath } from "../api/multichain";
import { tokenPath } from "../api/tokens";
import { tracePath } from "../api/traces";
import { evidenceAnchor } from "../evidence";
import { shortenHash } from "../format";
import { addressTitle } from "../fund-flow";
import type { ChainId, EntityLabel, InvestigationEntry, SearchResult } from "../types";
import { MOCK_FLOWS } from "./flows";
import { mockEvmAddress } from "./ids";
import { MOCK_MAPS } from "./maps";
import { MOCK_MULTICHAIN } from "./multichain";
import { MOCK_TOKENS } from "./tokens";
import { MOCK_TRACES } from "./traces";

/** Entri indeks: hasil pencarian beserta kunci yang bisa dicocokkan. */
export interface SearchIndexEntry {
  result: SearchResult;
  /** Address atau hash persis yang menunjuk entri ini. */
  exact: string[];
  /** Teks yang bisa dicari sebagian, mis. nama token atau nama label. */
  text: string[];
}

function addressEntry(
  id: string,
  address: string,
  chain: ChainId | undefined,
  label: EntityLabel | undefined,
  href: string,
  subtitle: string,
): SearchIndexEntry {
  return {
    result: { id, kind: "address", title: addressTitle(label), subtitle, chain, label, href, matchedBy: "" },
    exact: [address],
    text: label?.name ? [label.name] : [],
  };
}

const tokenEntries: SearchIndexEntry[] = MOCK_TOKENS.map((item) => ({
  result: {
    id: `token:${item.token.chain}:${item.token.address}`,
    kind: "token",
    title: item.token.name,
    subtitle: `${item.token.symbol} · ${shortenHash(item.token.address)}`,
    chain: item.token.chain,
    href: tokenPath(item.token.chain, item.token.address),
    matchedBy: "",
  },
  exact: [item.token.address],
  text: [item.token.name, item.token.symbol],
}));

const flowEntries: SearchIndexEntry[] = MOCK_FLOWS.map((flow) =>
  addressEntry(
    `flow:${flow.chain}:${flow.address}`,
    flow.address,
    flow.chain,
    flow.label,
    flowPath(flow.chain, flow.address),
    `Aliran dana · ${shortenHash(flow.address)}`,
  ),
);

const multichainEntries: SearchIndexEntry[] = MOCK_MULTICHAIN.map((profile) =>
  addressEntry(
    `multichain:${profile.address}`,
    profile.address,
    undefined,
    profile.label,
    multichainPath(profile.address),
    `Jelajah multichain · ${shortenHash(profile.address)}`,
  ),
);

const txEntries: SearchIndexEntry[] = MOCK_FLOWS.flatMap((flow) =>
  flow.transfers.map((transfer) => ({
    result: {
      id: `tx:${flow.chain}:${transfer.txHash}:${flow.address}`,
      kind: "transaction" as const,
      title: `${transfer.direction === "in" ? "Masuk ke" : "Keluar dari"} ${addressTitle(flow.label)}`,
      subtitle: shortenHash(transfer.txHash, 10, 6),
      chain: flow.chain,
      href: `${flowPath(flow.chain, flow.address)}#${evidenceAnchor(transfer.txHash)}`,
      matchedBy: "",
    },
    exact: [transfer.txHash],
    text: [],
  })),
);

export const MOCK_SEARCH_INDEX: SearchIndexEntry[] = [...tokenEntries, ...flowEntries, ...multichainEntries, ...txEntries];

/* -------------------------------------------------------------------------- */
/* Riwayat investigasi                                                         */
/* -------------------------------------------------------------------------- */

const [nebula, kodo] = MOCK_TOKENS;
const funderFlow = MOCK_FLOWS[0];
const [nblaMap] = MOCK_MAPS;
const [bundlerTrace] = MOCK_TRACES;
const [funderProfile] = MOCK_MULTICHAIN;

export const MOCK_HISTORY: InvestigationEntry[] = [
  {
    id: "hist-1",
    kind: "map",
    title: `Peta holder ${nblaMap.token.symbol}`,
    chain: nblaMap.chain,
    href: mapPath(nblaMap.chain, nblaMap.token.address),
    openedAt: "2026-10-03T04:12:00.000Z",
    note: "Cek apakah 5 bundler masih memegang token.",
    findingCount: 3,
  },
  {
    id: "hist-2",
    kind: "flow",
    title: addressTitle(funderFlow.label),
    chain: funderFlow.chain,
    href: flowPath(funderFlow.chain, funderFlow.address),
    openedAt: "2026-10-03T03:47:00.000Z",
    findingCount: 13,
  },
  {
    id: "hist-3",
    kind: "multichain",
    title: `${addressTitle(funderProfile.label)} di semua chain`,
    href: multichainPath(funderProfile.address),
    openedAt: "2026-10-02T15:20:00.000Z",
    note: "Ada bridge ke Base, lanjut pantau router di Base.",
  },
  {
    id: "hist-4",
    kind: "token",
    title: `${nebula.token.name} (${nebula.token.symbol})`,
    chain: nebula.token.chain,
    href: tokenPath(nebula.token.chain, nebula.token.address),
    openedAt: "2026-10-02T09:05:00.000Z",
    findingCount: nebula.risk.findings.length,
  },
  {
    id: "hist-5",
    kind: "trace",
    title: `${addressTitle(bundlerTrace.fromLabel)} → ${addressTitle(bundlerTrace.toLabel)}`,
    chain: bundlerTrace.chain,
    href: tracePath(bundlerTrace.chain, bundlerTrace.from, bundlerTrace.to),
    openedAt: "2026-09-30T18:40:00.000Z",
  },
  {
    id: "hist-6",
    kind: "token",
    title: `${kodo.token.name} (${kodo.token.symbol})`,
    chain: kodo.token.chain,
    href: tokenPath(kodo.token.chain, kodo.token.address),
    openedAt: "2026-09-29T07:15:00.000Z",
    findingCount: kodo.risk.findings.length,
  },
];

/** Isian yang sengaja membuat pencarian tiruan gagal, untuk mencoba tampilan error. */
export const MOCK_FAILING_QUERY = mockEvmAddress("demo:pencarian-gagal");

/** Contoh isian untuk halaman cari yang masih kosong; semuanya memberi hasil. */
export const MOCK_SEARCH_EXAMPLES: Array<{ label: string; query: string }> = [
  { label: "Nama token", query: nebula.token.name },
  { label: "Address wallet", query: funderFlow.address },
  { label: "Hash transaksi", query: funderFlow.transfers[0].txHash },
];
