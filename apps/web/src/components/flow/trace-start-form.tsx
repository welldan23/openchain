"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { tracePath } from "@/lib/api/traces";
import { CHAINS } from "@/lib/chains";
import type { ChainId } from "@/lib/types";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Mulai telusur jalur dana dari address ini ke address tujuan yang diketik. */
export function TraceStartForm({ chain, from }: { chain: ChainId; from: string }) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const evm = CHAINS[chain].addressFormat === "evm";

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const target = to.trim();
        if (evm ? !EVM_ADDRESS.test(target) : target.length < 32) {
          setError(evm ? "Isi address EVM tujuan: 0x diikuti 40 karakter hex." : "Isi address tujuan yang valid.");
          return;
        }
        if (target.toLowerCase() === from.toLowerCase()) {
          setError("Address tujuan sama dengan address asal.");
          return;
        }
        setError(null);
        router.push(tracePath(chain, from, target));
      }}
      className="space-y-2"
    >
      <label htmlFor="telusur-tujuan" className="block text-xs text-muted">
        Telusuri jalur dana dari address ini ke address tujuan
      </label>
      <div className="flex gap-2">
        <input
          id="telusur-tujuan"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder={evm ? "0x… address tujuan" : "Address tujuan"}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "telusur-tujuan-galat" : undefined}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-background transition hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-accent"
        >
          Telusuri
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>
      {error ? (
        <p id="telusur-tujuan-galat" className="text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}
