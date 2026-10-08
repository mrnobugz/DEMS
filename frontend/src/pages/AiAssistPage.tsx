import { useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/tabs";
import { useAnnounce } from "@/components/ui/sonner";
import { api, ApiError } from "@/lib/api";
import type { Page, Patient } from "@/lib/types";

export function AiAssistPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useAnnounce(error);

  useEffect(() => {
    void api<Page<Patient>>("/api/v1/patients?limit=100").then((p) => {
      setPatients(p.items);
      if (p.items[0]) setPatientId(p.items[0].id);
    });
  }, []);

  async function runRisk() {
    setError("");
    try {
      const data = await api<Record<string, unknown>>("/api/v1/ai/caries-risk", {
        method: "POST",
        body: JSON.stringify({ patient_id: patientId }),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not run the risk model");
    }
  }

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader
        title="AI Assist Gateway"
        description="Pluggable decision-support. Outputs are advisory, dentist-confirmed, and audit-logged."
      />
      {error && (
        <p className="text-sm text-danger" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-panel space-y-4 rounded-3xl p-5">
          <span className="ai-badge">Caries risk scoring</span>
          <p className="text-sm text-muted">
            Combines history, chronic conditions, and age band into a recall-prioritization score.
          </p>
          <div>
            <label className="label">Patient</label>
            <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={() => void runRisk()}>
            Run risk model
          </button>
        </div>

        <div className="glass-panel rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Result</h3>
          {!result && (
            <EmptyState title="No suggestion yet" hint="Choose a patient and run the caries risk model." />
          )}
          {result && (
            <div className="mt-3 space-y-2 text-sm">
              <div className="ai-badge">is_ai_suggested</div>
              <pre className="overflow-auto rounded-2xl bg-brand-50 p-4 text-xs text-brand-900">
                {JSON.stringify(result, null, 2)}
              </pre>
              <p className="text-xs text-muted">{String(result.disclaimer ?? "")}</p>
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-3xl p-5">
        <h3 className="font-display text-lg font-bold text-brand-900">Roadmap in this gateway</h3>
        <ul className="mt-3 grid gap-2 text-sm text-muted md:grid-cols-2">
          <li>• Radiograph pre-screening (DICOM) — Phase 5</li>
          <li>• Restoration failure prediction</li>
          <li>• Smart scheduling (live in Schedule)</li>
          <li>• SOAP draft assist (live in Patient chart)</li>
          <li>• Inventory demand forecasting</li>
          <li>• Constrained patient FAQ chatbot</li>
        </ul>
      </div>
    </div>
  );
}
