import { ShieldAlert } from "lucide-react";
import { RiskLevelBadge, SeverityBadge } from "@/components/badges";
import { ClassificationBadge } from "@/components/classification-badge";
import { HashLink } from "@/components/ui/hash-link";
import { Panel } from "@/components/ui/panel";
import { explorerTxUrl } from "@/lib/chains";
import { RISK_LEVEL_META } from "@/lib/labels";
import type { ChainId, RiskSummary } from "@/lib/types";

interface RiskPanelProps {
  chain: ChainId;
  risk: RiskSummary;
}

export function RiskPanel({ chain, risk }: RiskPanelProps) {
  const level = RISK_LEVEL_META[risk.level];
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
          <span className="text-3xl font-semibold tracking-tight">{risk.score}</span>
          <span className="text-sm text-muted">/100</span>
        </p>
        <div className="flex-1">
          <div
            role="meter"
            aria-label="Skor risiko"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={risk.score}
            className="h-2 overflow-hidden rounded-full bg-surface-raised"
          >
            <div className={`h-full rounded-full ${level.barClass}`} style={{ width: `${risk.score}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Skor gabungan dari {risk.findings.length} temuan. Skor ini estimasi, jadi cek bukti tiap
            temuan sebelum mengambil kesimpulan.
          </p>
        </div>
      </div>

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
    </Panel>
  );
}
