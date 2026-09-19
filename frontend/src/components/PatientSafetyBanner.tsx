import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";

export type SafetyItem = {
  id: string;
  kind: string;
  code: string;
  label: string;
  notes?: string | null;
  is_active: boolean;
};

export type SafetySummary = {
  patient_id: string;
  pregnancy_trimester?: number | null;
  latex_allergy: boolean;
  history_reviewed_at?: string | null;
  merged_into_id?: string | null;
  items: SafetyItem[];
  allergies_text?: string | null;
  conditions_text?: string | null;
  medications_text?: string | null;
};

export function PatientSafetyBanner({ patientId }: { patientId?: string }) {
  const [summary, setSummary] = useState<SafetySummary | null>(null);

  useEffect(() => {
    if (!patientId) {
      setSummary(null);
      return;
    }
    api<SafetySummary>(`/api/v1/patients/${patientId}/safety`)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [patientId]);

  if (!patientId || !summary) return null;

  const chips: string[] = [];
  if (summary.merged_into_id) chips.push("Merged record");
  if (summary.pregnancy_trimester) chips.push(`Pregnancy T${summary.pregnancy_trimester}`);
  if (summary.latex_allergy) chips.push("Latex allergy");
  for (const item of summary.items) chips.push(item.label);
  if (!summary.items.some((i) => i.kind === "allergy") && summary.allergies_text) {
    chips.push(summary.allergies_text);
  }

  if (chips.length === 0) return null;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <span className="font-semibold">Alerts · </span>
      {chips.slice(0, 8).join(" · ")}
      {summary.merged_into_id && (
        <>
          {" "}
          <Link className="underline" to={`/patients/${summary.merged_into_id}`}>
            Open surviving chart
          </Link>
        </>
      )}
    </div>
  );
}
