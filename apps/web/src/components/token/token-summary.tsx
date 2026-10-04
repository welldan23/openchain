import { Sparkles } from "lucide-react";
import { SaveToCaseButton } from "@/components/case/save-to-case-dialog";
import { ClassificationBadge } from "@/components/classification-badge";
import { Panel } from "@/components/ui/panel";
import { tokenPath } from "@/lib/api/tokens";
import { findingsFromRisk } from "@/lib/cases";
import { buildSectionLinks, buildTokenHighlights } from "@/lib/token-summary";
import type { TokenInvestigation } from "@/lib/types";
import { MarketStats } from "./market-stats";
import { TokenHeader } from "./token-header";

/**
 * Blok Ringkasan Token: identitas token, statistik pasar, dan sorotan utama
 * dalam satu blok, supaya isi token bisa dipahami sekilas.
 */
export function TokenSummary({ data }: { data: TokenInvestigation }) {
  const highlights = buildTokenHighlights(data);
  const sectionLinks = buildSectionLinks(data);

  return (
    <div className="space-y-5">
      <TokenHeader
        token={data.token}
        riskLevel={data.risk.level}
        snapshot={data.snapshot}
        actions={
          <SaveToCaseButton
            subject={{
              kind: "token",
              chain: data.token.chain,
              address: data.token.address,
              title: `${data.token.name} (${data.token.symbol})`,
              href: tokenPath(data.token.chain, data.token.address),
            }}
            findings={findingsFromRisk(data.risk.findings)}
            suggestedTitle={`Investigasi ${data.token.symbol}`}
          />
        }
      />
      <MarketStats market={data.market} />

      <Panel
        id="ringkasan"
        title="Ringkasan token"
        description="Sorotan utama dari snapshot data. Detail dan buktinya ada di bagian bawah."
        icon={Sparkles}
      >
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {highlights.map((highlight) => (
            <li key={highlight.id} className="rounded-lg bg-surface-raised px-3 py-2.5">
              {highlight.classification ? (
                <div className="mb-1.5">
                  <ClassificationBadge classification={highlight.classification} />
                </div>
              ) : null}
              <p className="text-sm leading-relaxed text-foreground/90">{highlight.text}</p>
            </li>
          ))}
        </ul>

        <nav
          aria-label="Lompat ke bagian"
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"
        >
          <span className="text-xs text-muted">Lompat ke:</span>
          {sectionLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 py-1 text-xs text-foreground/90 transition hover:border-accent/60 hover:text-accent"
            >
              {link.label}
              <span className="rounded-full bg-background px-1.5 text-[10px] tabular-nums text-muted">
                {link.count}
              </span>
            </a>
          ))}
        </nav>
      </Panel>
    </div>
  );
}
