import { ArrowLeftRight, Coins, Footprints, Globe2, Network, Waypoints, Wallet, type LucideIcon } from "lucide-react";
import type { InvestigationKind, SearchResultKind } from "@/lib/types";

/** Judul dan ikon tiap kelompok hasil pencarian, dalam urutan tampil. */
export const RESULT_GROUPS: Array<{ kind: SearchResultKind; title: string; icon: LucideIcon }> = [
  { kind: "token", title: "Token", icon: Coins },
  { kind: "address", title: "Address", icon: Wallet },
  { kind: "transaction", title: "Transaksi", icon: ArrowLeftRight },
];

export const INVESTIGATION_KIND_META: Record<InvestigationKind, { label: string; icon: LucideIcon }> = {
  token: { label: "Token", icon: Coins },
  flow: { label: "Aliran dana", icon: Waypoints },
  trace: { label: "Telusur jalur", icon: Footprints },
  map: { label: "Peta hubungan", icon: Network },
  multichain: { label: "Multichain", icon: Globe2 },
};
