"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChainMultiSelect, type ChainOption } from "@/components/chain-multi-select";
import { serializeChainSelection } from "@/lib/multichain";
import type { ChainId } from "@/lib/types";

/** Pemilih jaringan halaman multichain; pilihannya disimpan di `?jaringan=`. */
export function MultichainChainPicker({ options, selected }: { options: ChainOption[]; selected: ChainId[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function update(next: ChainId[]) {
    const params = new URLSearchParams(window.location.search);
    const value = serializeChainSelection(next, options.map((option) => option.chain));
    if (value) params.set("jaringan", value);
    else params.delete("jaringan");
    const query = params.toString();
    startTransition(() => router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false }));
  }

  return <ChainMultiSelect options={options} selected={selected} onChange={update} busy={pending} />;
}
