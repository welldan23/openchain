import { BellRing, ChevronRight, FileText, FolderOpen, Footprints, Globe2, Network, Search, ShieldAlert, TriangleAlert, Waypoints } from "lucide-react";
import Link from "next/link";
import { ChainBadge, EntityLabelBadge, RiskLevelBadge } from "@/components/badges";
import { RiskScoreBadge } from "@/components/risk/risk-score";
import { flowFailureDemoPath, flowPath, listSampleFlows } from "@/lib/api/flows";
import { listSampleMaps, mapFailureDemoPath, mapPath } from "@/lib/api/maps";
import { listSampleMultichain, multichainFailureDemoPath, multichainPath } from "@/lib/api/multichain";
import { failureDemoPath, listSampleTokens, tokenPath } from "@/lib/api/tokens";
import { caseFailureDemoPath } from "@/lib/api/cases";
import { reportFailureDemoPath } from "@/lib/api/reports";
import { listSampleRisks, riskFailureDemoPath, riskPath } from "@/lib/api/risk";
import { searchFailureDemoPath } from "@/lib/api/search";
import { listSampleTraces, traceFailureDemoPath, tracePath } from "@/lib/api/traces";
import { shortenHash } from "@/lib/format";
import { addressTitle } from "@/lib/fund-flow";
import { RISK_OBJECT_KIND_META, RISK_TONES } from "@/lib/labels";

export default async function Home() {
  const [samples, flows, traces, maps, multichain, risks] = await Promise.all([
    listSampleTokens(),
    listSampleFlows(),
    listSampleTraces(),
    listSampleMaps(),
    listSampleMultichain(),
    listSampleRisks(),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-medium uppercase tracking-widest text-accent">
        Workspace investigasi on-chain
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Ubah data blockchain mentah jadi temuan yang bisa ditelusuri dan dibuktikan.
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
        Multichain wallet tracing, token due diligence, fund-flow analysis, risk intelligence, and
        evidence-backed reporting.
      </p>

      <Link
        href="/cari"
        className="group mt-8 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted transition hover:border-accent/50 hover:text-foreground"
      >
        <Search className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Cari address, hash transaksi, atau nama token…</span>
        <span className="hidden text-xs sm:inline">Riwayat investigasi</span>
        <ChevronRight className="size-4 shrink-0 transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
      </Link>
      <Link
        href="/kasus"
        className="group mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm transition hover:border-accent/50"
      >
        <FolderOpen className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Kasus investigasi tersimpan</span>
          <span className="mt-0.5 block text-xs text-muted">Temuan, bukti transaksi, catatan, dan snapshot data per kasus.</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
      </Link>

      <Link
        href="/laporan"
        className="group mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm transition hover:border-accent/50"
      >
        <FileText className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Laporan investigasi</span>
          <span className="mt-0.5 block text-xs text-muted">Klaim berbukti dengan provider, waktu data, dan hash transaksi; siap dibagikan.</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
      </Link>

      <section aria-labelledby="sample-title" className="mt-10">
        <h2 id="sample-title" className="text-sm font-semibold">
          Coba buka token contoh
        </h2>
        <p className="mt-1 text-xs text-muted">
          Data masih tiruan. Token di bawah ini fiktif dan dipakai untuk mencoba tampilan.
        </p>
        <ul className="mt-4 space-y-3">
          {samples.map((token) => (
            <li key={`${token.chain}:${token.address}`}>
              <Link
                href={tokenPath(token.chain, token.address)}
                className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br from-teal-400/80 to-indigo-500/80 text-xs font-bold text-white"
                >
                  {token.symbol.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{token.name}</span>
                    <span className="text-xs text-muted">{token.symbol}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <ChainBadge chain={token.chain} />
                    <RiskLevelBadge level={token.riskLevel} />
                    <span className="font-mono text-[11px] text-muted">
                      {shortenHash(token.address)}
                    </span>
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sample-flow-title" className="mt-10">
        <h2 id="sample-flow-title" className="text-sm font-semibold">
          Coba lacak aliran dana
        </h2>
        <p className="mt-1 text-xs text-muted">
          Lihat dari mana dana sebuah address berasal dan ke mana bergerak. Address-nya fiktif dan
          nyambung dengan token contoh di atas.
        </p>
        <ul className="mt-4 space-y-3">
          {flows.map((flow) => (
            <li key={`${flow.chain}:${flow.address}`}>
              <Link
                href={flowPath(flow.chain, flow.address)}
                className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30"
                >
                  <Waypoints className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{addressTitle(flow.label)}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <ChainBadge chain={flow.chain} />
                    {flow.label ? <EntityLabelBadge label={flow.label} interactive={false} /> : null}
                    <span className="font-mono text-[11px] text-muted">{shortenHash(flow.address)}</span>
                    <span className="text-[11px] text-muted">· {flow.transferCount} transfer</span>
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sample-trace-title" className="mt-10">
        <h2 id="sample-trace-title" className="text-sm font-semibold">
          Coba telusur antar wallet
        </h2>
        <p className="mt-1 text-xs text-muted">
          Ikuti jejak dana dari satu wallet ke wallet lain, langkah demi langkah.
        </p>
        <ul className="mt-4 space-y-3">
          {traces.map((trace) => (
            <li key={`${trace.chain}:${trace.from}:${trace.to}`}>
              <Link
                href={tracePath(trace.chain, trace.from, trace.to)}
                className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30"
                >
                  <Footprints className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {addressTitle(trace.fromLabel)} → {addressTitle(trace.toLabel)}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <ChainBadge chain={trace.chain} />
                    <span className="text-[11px] text-muted">
                      {trace.hopCount > 0 ? `${trace.hopCount} langkah` : "Tidak ada jalur"}
                    </span>
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sample-map-title" className="mt-10">
        <h2 id="sample-map-title" className="text-sm font-semibold">
          Coba peta hubungan wallet
        </h2>
        <p className="mt-1 text-xs text-muted">
          Lihat holder sebuah token sebagai gelembung, lengkap dengan klaster dan transfer di antaranya.
        </p>
        <ul className="mt-4 space-y-3">
          {maps.map((map) => (
            <li key={`${map.chain}:${map.tokenAddress}`}>
              <Link
                href={mapPath(map.chain, map.tokenAddress)}
                className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30"
                >
                  <Network className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Holder {map.name}</span>
                    <span className="text-xs text-muted">{map.symbol}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <ChainBadge chain={map.chain} />
                    <span className="text-[11px] text-muted">
                      {map.walletCount} wallet · {map.clusterCount} klaster
                    </span>
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sample-multichain-title" className="mt-10">
        <h2 id="sample-multichain-title" className="text-sm font-semibold">
          Coba jelajah multichain
        </h2>
        <p className="mt-1 text-xs text-muted">
          Bandingkan aktivitas satu address EVM di beberapa chain dan lihat perpindahannya lewat bridge.
        </p>
        <ul className="mt-4 space-y-3">
          {multichain.map((profile) => (
            <li key={profile.address}>
              <Link
                href={multichainPath(profile.address)}
                className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30"
                >
                  <Globe2 className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{addressTitle(profile.label)}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {profile.activeChains.length > 0 ? (
                      profile.activeChains.map((chain) => <ChainBadge key={chain} chain={chain} />)
                    ) : (
                      <span className="text-[11px] text-muted">Belum aktif di chain mana pun</span>
                    )}
                    <span className="font-mono text-[11px] text-muted">{shortenHash(profile.address)}</span>
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sample-risk-title" className="mt-10">
        <h2 id="sample-risk-title" className="text-sm font-semibold">
          Coba lihat risiko objek
        </h2>
        <p className="mt-1 text-xs text-muted">
          Skor risiko token, wallet, atau kontrak beserta alasan, peringatan dini, dan sumber labelnya.
        </p>
        <ul className="mt-4 space-y-3">
          {risks.map((risk) => (
            <li key={`${risk.chain}:${risk.address}`}>
              <Link
                href={riskPath(risk.chain, risk.address)}
                className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30"
                >
                  <ShieldAlert className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{risk.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted">{RISK_OBJECT_KIND_META[risk.kind].label}</span>
                    <ChainBadge chain={risk.chain} />
                    <RiskScoreBadge score={risk.score} level={risk.level} />
                    {risk.warningCount > 0 ? (
                      <span className={`inline-flex items-center gap-1 text-[11px] ${RISK_TONES.high.textClass}`}>
                        <BellRing className="size-3" aria-hidden />
                        {risk.warningCount} peringatan
                      </span>
                    ) : null}
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="states-title" className="mt-10">
        <h2 id="states-title" className="text-sm font-semibold">
          Coba tampilan status
        </h2>
        <p className="mt-1 text-xs text-muted">
          Sunyi Protocol di atas memperlihatkan tampilan saat data token belum ada, dan wallet tanpa label
          memperlihatkan tampilan saat belum ada transfer. Jalur tanpa langkah memperlihatkan tampilan saat
          dua wallet tidak terhubung. Semua halaman juga menampilkan kerangka loading sebentar sebelum
          datanya muncul.
        </p>
        <Link
          href={failureDemoPath()}
          className="group mt-4 flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-rose-400/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Simulasi data gagal dimuat</span>
            <span className="mt-0.5 block text-xs text-muted">
              Membuka token yang sengaja dibuat gagal untuk melihat tampilan error.
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-rose-300"
            aria-hidden
          />
        </Link>
        <Link
          href={flowFailureDemoPath()}
          className="group mt-3 flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-rose-400/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Simulasi aliran dana gagal dimuat</span>
            <span className="mt-0.5 block text-xs text-muted">
              Membuka address yang sengaja dibuat gagal untuk melihat tampilan error.
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-rose-300"
            aria-hidden
          />
        </Link>
        <Link
          href={traceFailureDemoPath()}
          className="group mt-3 flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-rose-400/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Simulasi jalur dana gagal dimuat</span>
            <span className="mt-0.5 block text-xs text-muted">
              Membuka jalur yang sengaja dibuat gagal untuk melihat tampilan error.
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-rose-300"
            aria-hidden
          />
        </Link>
        <Link
          href={mapFailureDemoPath()}
          className="group mt-3 flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-rose-400/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Simulasi peta hubungan gagal dimuat</span>
            <span className="mt-0.5 block text-xs text-muted">
              Membuka peta yang sengaja dibuat gagal untuk melihat tampilan error.
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-rose-300"
            aria-hidden
          />
        </Link>
        <Link
          href={multichainFailureDemoPath()}
          className="group mt-3 flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-rose-400/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Simulasi data lintas chain gagal dimuat</span>
            <span className="mt-0.5 block text-xs text-muted">
              Membuka address yang sengaja dibuat gagal untuk melihat tampilan error.
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-rose-300"
            aria-hidden
          />
        </Link>
        <Link
          href={searchFailureDemoPath()}
          className="group mt-3 flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-rose-400/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Simulasi pencarian gagal</span>
            <span className="mt-0.5 block text-xs text-muted">
              Mencari address yang sengaja dibuat gagal untuk melihat tampilan error.
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-rose-300"
            aria-hidden
          />
        </Link>
        <Link
          href={caseFailureDemoPath()}
          className="group mt-3 flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-rose-400/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Simulasi kasus gagal dimuat</span>
            <span className="mt-0.5 block text-xs text-muted">
              Membuka kasus yang sengaja dibuat gagal untuk melihat tampilan error.
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-rose-300"
            aria-hidden
          />
        </Link>
        <Link
          href={riskFailureDemoPath()}
          className="group mt-3 flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-rose-400/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Simulasi penilaian risiko gagal dimuat</span>
            <span className="mt-0.5 block text-xs text-muted">
              Membuka objek yang sengaja dibuat gagal untuk melihat tampilan error.
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-rose-300"
            aria-hidden
          />
        </Link>
        <Link
          href={reportFailureDemoPath()}
          className="group mt-3 flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-rose-400/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Simulasi laporan gagal dimuat</span>
            <span className="mt-0.5 block text-xs text-muted">
              Membuka laporan yang sengaja dibuat gagal untuk melihat tampilan error.
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-rose-300"
            aria-hidden
          />
        </Link>
      </section>
    </main>
  );
}
