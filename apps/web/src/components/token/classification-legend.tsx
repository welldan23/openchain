import { Info } from "lucide-react";
import { ClassificationBadge } from "@/components/classification-badge";
import { Panel } from "@/components/ui/panel";
import { CLASSIFICATION_META, CLASSIFICATION_ORDER } from "@/lib/labels";

/** Penjelasan tag klasifikasi supaya user tahu seberapa kuat tiap temuan. */
export function ClassificationLegend() {
  return (
    <Panel
      id="klasifikasi"
      title="Cara membaca tag"
      description="Setiap temuan menyebut asal datanya. Tap tag di halaman ini untuk melihat artinya."
      icon={Info}
    >
      <dl className="space-y-3">
        {CLASSIFICATION_ORDER.map((key) => (
          <div key={key}>
            <dt>
              <ClassificationBadge classification={key} interactive={false} />
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
