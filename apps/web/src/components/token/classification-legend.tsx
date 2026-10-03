import { Info } from "lucide-react";
import { ClassificationBadge } from "@/components/badges";
import { Panel } from "@/components/ui/panel";
import { CLASSIFICATION_META } from "@/lib/labels";
import type { FindingClassification } from "@/lib/types";

const ORDER: FindingClassification[] = [
  "fact",
  "calculation",
  "heuristic",
  "external_label",
  "assumption",
];

/** Penjelasan tag klasifikasi supaya user tahu seberapa kuat tiap temuan. */
export function ClassificationLegend() {
  return (
    <Panel
      id="klasifikasi"
      title="Cara membaca tag"
      description="Setiap temuan menyebut asal datanya."
      icon={Info}
    >
      <dl className="space-y-3">
        {ORDER.map((key) => (
          <div key={key}>
            <dt>
              <ClassificationBadge classification={key} />
            </dt>
            <dd className="mt-1 text-xs leading-relaxed text-muted">
              {CLASSIFICATION_META[key].description}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
