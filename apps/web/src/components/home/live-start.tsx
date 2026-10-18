import { ChevronRight, CircleAlert } from "lucide-react";
import Link from "next/link";
import { ChainBadge, RiskLevelBadge } from "@/components/badges";
import { apiJson } from "@/lib/api/http";
import { toChainId } from "@/lib/api/live/common";
import { tokenPath } from "@/lib/api/tokens";
import { formatDateTime, shortenHash } from "@/lib/format";
import type { ChainId, RiskLevel } from "@/lib/types";

interface RecentToken {
  chain: string;
  address: string;
  name: string | null;
  symbol: string | null;
  snapshotAt: string;
  riskLevel: RiskLevel | null;
}

interface CatalogChain {
  id: string;
  name: string;
  supportStatus: "validated" | "experimental" | "planned";
}

async function load(): Promise<{ tokens: Array<RecentToken & { chainId: ChainId }>; chains: CatalogChain[] } | null> {
  try {
    const [tokens, catalog] = await Promise.all([apiJson<{ tokens: RecentToken[] }>("/tokens", { query: { limit: 8 } }), apiJson<{ chains: CatalogChain[] }>("/chains")]);
    return {
      tokens: tokens.tokens.flatMap((token) => {
        const chainId = toChainId(token.chain);
        return chainId ? [{ ...token, chainId }] : [];
      }),
      chains: catalog.chains,
    };
  } catch {
    return null;
  }
}

/** Titik awal investigasi dari data tersimpan: token yang sudah diambil datanya dan status dukungan chain. */
export async function LiveStart() {
  const data = await load();
  if (!data) {
    return (
      <p role="status" className="mt-10 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Layanan data belum bisa dihubungi, jadi daftar token terbaru belum bisa ditampilkan. Pencarian tetap bisa dicoba.
      </p>
    );
  }
  const validated = data.chains.filter((chain) => chain.supportStatus === "validated");
  const experimental = data.chains.filter((chain) => chain.supportStatus === "experimental");

  return (
    <>
      <section aria-labelledby="token-terbaru" className="mt-10">
        <h2 id="token-terbaru" className="text-sm font-semibold">
          Token yang sudah dianalisis
        </h2>
        <p className="mt-1 text-xs text-muted">Snapshot terbaru dulu. Token lain bisa dicari lewat address kontraknya.</p>
        {data.tokens.length === 0 ? (
          <p className="mt-4 rounded-xl border border-line bg-surface p-4 text-xs text-muted">
            Belum ada token yang diambil datanya. Jalankan <code className="font-mono text-foreground">npm run ingest -- &lt;chain&gt; &lt;address&gt;</code> di server.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.tokens.map((token) => (
              <li key={`${token.chain}:${token.address}`}>
                <Link
                  href={tokenPath(token.chainId, token.address)}
                  className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{token.name ?? "Token tanpa nama"}</span>
                      {token.symbol ? <span className="text-xs text-muted">{token.symbol}</span> : null}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <ChainBadge chain={token.chainId} />
                      <RiskLevelBadge level={token.riskLevel ?? "unknown"} />
                      <span className="font-mono text-[11px] text-muted">{shortenHash(token.address)}</span>
                      <span className="text-[11px] text-muted">· snapshot {formatDateTime(token.snapshotAt)}</span>
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="chain-didukung" className="mt-10">
        <h2 id="chain-didukung" className="text-sm font-semibold">
          Chain yang didukung
        </h2>
        <p className="mt-1 text-xs text-muted">Status hanya naik setelah lolos smoke test yang tersimpan sebagai bukti.</p>
        <dl className="mt-4 space-y-2 text-xs">
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-muted">Tervalidasi:</dt>
            <dd className="text-foreground">{validated.length > 0 ? validated.map((chain) => chain.name).join(", ") : "belum ada"}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-muted">Eksperimental:</dt>
            <dd className="text-foreground">{experimental.length > 0 ? experimental.map((chain) => chain.name).join(", ") : "tidak ada"}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
