import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { StatGrid, useDepartmentHome } from "./FrontClinicalPages";

type Recall = {
  id: string;
  patient_code: string;
  name: string;
  hygiene_recall_due?: string | null;
  perio_risk_band?: string | null;
};

export function HygienePage() {
  const { home } = useDepartmentHome();
  const [recall, setRecall] = useState<Recall[]>([]);

  useEffect(() => {
    api<Recall[]>("/api/v1/patients/hygiene-recall-due")
      .then(setRecall)
      .catch(() => setRecall([]));
  }, []);

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-900">Hygiene bay</h2>
        <p className="text-sm text-muted">Recall due list driven by perio risk bands.</p>
      </div>
      {home && <StatGrid home={home} />}
      <Link className="btn-primary inline-flex" to="/patients">
        Open patients · perio chart
      </Link>
      <section className="glass-panel rounded-3xl p-5">
        <h3 className="font-display text-lg font-bold">Hygiene recall (next 14 days / overdue)</h3>
        {recall.length === 0 ? (
          <EmptyState
            title="No recalls due"
            hint="High/moderate perio exams set hygiene_recall_due automatically."
          />
        ) : (
          <ul className="mt-3 divide-y divide-brand-100">
            {recall.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <Link className="font-semibold text-brand-700 hover:underline" to={`/patients/${r.id}`}>
                    {r.patient_code} · {r.name}
                  </Link>
                  <div className="text-xs text-muted capitalize">
                    Risk {r.perio_risk_band || "—"} · due {r.hygiene_recall_due}
                  </div>
                </div>
                <span className="status-pill status-pill--warn">Recall</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
