import { ShieldAlert, ShieldQuestion } from "lucide-react";
import { RiskLevelBadge, SeverityBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { explorerTxUrl } from "@/lib/chains";
import { RISK_LEVEL_META } from "@/lib/labels";
import type { ChainId, RiskSummary } from "@/lib/types";

interface RiskPanelProps {
  chain: ChainId;
  risk: RiskSummary;
}

export function RiskPanel({ chain, risk }: RiskPanelProps) {
  const level = RISK_LEVEL_META[risk.level];
  const unrated = risk.level === "unknown";
  return (
    <Panel
      id="risiko"
      title="Ringkasan risiko"
      description="Setiap temuan diberi tag asal datanya dan bukti transaksinya."
      icon={ShieldAlert}
      action={<RiskLevelBadge level={risk.level} />}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <p className="shrink-0">
          <span className="text-3xl font-semibold tracking-tight">{unrated ? "–" : risk.score}</span>
          <span className="text-sm text-muted">/100</span>
        </p>
        <div className="flex-1">
          <div
            role="meter"
            aria-label="Skor risiko"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={unrated ? 0 : risk.score}
            aria-valuetext={unrated ? "Belum dinilai" : undefined}
            className="h-2 overflow-hidden rounded-full bg-surface-raised"
          >
            <div
              className={`h-full rounded-full ${level.barClass}`}
              style={{ width: `${unrated ? 0 : risk.score}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {unrated
              ? "Skor belum bisa dihitung karena data token belum cukup."
              : risk.findings.length > 0
                ? `Skor gabungan dari ${risk.findings.length} temuan. Skor ini estimasi, jadi cek bukti tiap temuan sebelum mengambil kesimpulan.`
                : "Skor ini belum didukung temuan apa pun, jadi anggap sebagai perkiraan awal."}
          </p>
        </div>
      </div>

      {risk.findings.length === 0 ? (
        <EmptyState
          className="mt-5"
          icon={ShieldQuestion}
          title="Belum ada temuan risiko"
          description="Tidak ada temuan pada snapshot ini. Ini bukan jaminan token aman, karena sebagian modul analisis mungkin belum punya cukup data."
        />
      ) : (
        <ul className="mt-5 divide-y divide-line">
          {risk.findings.map((finding) => (
            <li key={finding.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <SeverityBadge severity={finding.severity} />
                <ClassificationBadge classification={finding.classification} />
              </div>
              <h3 className="mt-2 text-sm font-medium text-foreground">{finding.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{finding.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {finding.evidenceTxHashes.length > 0 ? (
                  <>
                    <span className="text-muted">
                      Bukti ({finding.evidenceTxHashes.length} transaksi):
                    </span>
                    {finding.evidenceTxHashes.map((hash) => (
                      <HashLink
                        key={hash}
                        value={hash}
                        href={explorerTxUrl(chain, hash)}
                        copyLabel="Salin hash transaksi"
                      />
                    ))}
                  </>
                ) : (
                  <span className="text-muted italic">Belum ada bukti transaksi untuk temuan ini.</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
